[CmdletBinding()]
param(
  [string]$CustomerPath = (Join-Path (Split-Path $PSScriptRoot -Parent) '..\food-trailer-customer'),
  [string]$AdminPath = (Join-Path (Split-Path $PSScriptRoot -Parent) '..\food-trailer-admin'),
  [string]$ApiPath = (Split-Path $PSScriptRoot -Parent),
  [string]$CustomerCommand = 'npm run dev',
  [string]$AdminCommand = 'npm run dev',
  [int]$ApiPort = 3001,
  [int]$CustomerPort = 3000,
  [int]$AdminPort = 3002,
  [string]$JwtSecret = '',
  [string]$AdminPassword = '',
  [switch]$SkipUiInstall
)

$ErrorActionPreference = 'Stop'
$containerName = 'food-trailer-postgres'
$databaseUrl = 'postgresql://postgres:postgres@localhost:5432/food_trailer?schema=public'
$apiUrl = "http://localhost:$ApiPort"
$customerUrl = "http://localhost:$CustomerPort"
$adminUrl = "http://localhost:$AdminPort"

function Assert-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

function Quote-PowerShellLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-NpmCi([string]$Path) {
  Push-Location $Path
  try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed in $Path" }
  } finally {
    Pop-Location
  }
}

function Assert-PortAvailable([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if ($asyncResult.AsyncWaitHandle.WaitOne(150)) {
      try {
        $client.EndConnect($asyncResult)
        throw "Port $Port is already in use. Stop the existing process or pass a different port."
      } catch [System.Net.Sockets.SocketException] {
      }
    }
  } finally {
    $client.Close()
  }
}

function New-RandomBytes([int]$Length) {
  $bytes = New-Object byte[] $Length
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return $bytes
}

Assert-Command 'docker' 'Install Docker Desktop and start it.'
Assert-Command 'node' 'Install Node.js 20 or later.'
Assert-Command 'npm' 'Install Node.js, which includes npm.'

if (-not (Test-Path (Join-Path $ApiPath 'package-lock.json'))) {
  throw "API path does not contain package-lock.json: $ApiPath"
}
if (-not (Test-Path $CustomerPath)) { throw "Customer path not found: $CustomerPath" }
if (-not (Test-Path $AdminPath)) { throw "Admin path not found: $AdminPath" }

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }

$container = docker ps -a --filter "name=^/$containerName$" --format '{{.Names}}'
if (-not $container) {
  docker run --name $containerName `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=postgres `
    -e POSTGRES_DB=food_trailer `
    -p 5432:5432 -d postgres:16-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the PostgreSQL container.' }
} else {
  $running = docker ps --filter "name=^/$containerName$" --format '{{.Names}}'
  if (-not $running) {
    docker start $containerName
    if ($LASTEXITCODE -ne 0) { throw 'Unable to start the PostgreSQL container.' }
  }
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  docker exec $containerName pg_isready -U postgres -d food_trailer *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
  if ($attempt -eq 29) { throw 'PostgreSQL did not become ready in 30 seconds.' }
}

Assert-PortAvailable $ApiPort
Assert-PortAvailable $CustomerPort
Assert-PortAvailable $AdminPort

if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
  $JwtSecret = ([BitConverter]::ToString((New-RandomBytes 32)) -replace '-', '').ToLowerInvariant()
}
if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
  $AdminPassword = [Convert]::ToBase64String((New-RandomBytes 12))
}

Invoke-NpmCi $ApiPath
Push-Location $ApiPath
try {
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { throw 'Prisma client generation failed.' }
} finally {
  Pop-Location
}
if (-not $SkipUiInstall) {
  if (Test-Path (Join-Path $CustomerPath 'package-lock.json')) { Invoke-NpmCi $CustomerPath }
  if (Test-Path (Join-Path $AdminPath 'package-lock.json')) { Invoke-NpmCi $AdminPath }
}

$env:DATABASE_URL = $databaseUrl
Push-Location $ApiPath
try {
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Prisma migrations failed.' }
} finally {
  Pop-Location
}

$passwordHash = node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" $AdminPassword
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($passwordHash)) {
  throw 'Unable to generate the admin password hash.'
}

$seedSql = @'
INSERT INTO "User" ("id", "username", "password", "role")
VALUES ('00000000-0000-0000-0000-000000000001', 'admin', '__PASSWORD_HASH__', 'ADMIN')
ON CONFLICT ("username") DO UPDATE SET "password" = EXCLUDED."password", "role" = EXCLUDED."role";

INSERT INTO "MenuItem" (
  "id", "name", "description", "price", "category", "isAvailable", "imageUrl",
  "inventoryItemId", "inventoryDeduction", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-0000-0000-000000000101', 'Demo Burger', 'Local demo menu item',
  25.00, 'Grill', TRUE, '', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name", "price" = EXCLUDED."price", "category" = EXCLUDED."category",
  "isAvailable" = EXCLUDED."isAvailable", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Settings" (
  "id", "isAcceptingOrders", "openTime", "closeTime", "overrideOpen",
  "muteKitchenDing", "adminLanguage", "updatedAt"
) VALUES (
  'GLOBAL', TRUE, '00:00', '23:59', TRUE, FALSE, 'en', CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO UPDATE SET
  "isAcceptingOrders" = EXCLUDED."isAcceptingOrders",
  "openTime" = EXCLUDED."openTime", "closeTime" = EXCLUDED."closeTime",
  "overrideOpen" = EXCLUDED."overrideOpen", "updatedAt" = CURRENT_TIMESTAMP;
'@
$seedSql = $seedSql.Replace('__PASSWORD_HASH__', $passwordHash.Trim())
$seedFile = Join-Path ([IO.Path]::GetTempPath()) "food-trailer-seed-$PID.sql"
Set-Content -LiteralPath $seedFile -Value $seedSql -Encoding utf8
try {
  Get-Content -LiteralPath $seedFile -Raw | docker exec -i $containerName psql -U postgres -d food_trailer
  if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed.' }
} finally {
  Remove-Item -LiteralPath $seedFile -Force -ErrorAction SilentlyContinue
}

$apiCommand = "`$env:DATABASE_URL=$(Quote-PowerShellLiteral $databaseUrl); `$env:JWT_SECRET=$(Quote-PowerShellLiteral $JwtSecret); `$env:STRIPE_SECRET_KEY='local-stripe-placeholder'; `$env:STRIPE_WEBHOOK_SECRET='local-webhook-placeholder'; `$env:CUSTOMER_URL=$(Quote-PowerShellLiteral $customerUrl); `$env:PORT=$ApiPort; Set-Location -LiteralPath $(Quote-PowerShellLiteral $ApiPath); npm run start:dev"
$customerCommandLine = "`$env:NEXT_PUBLIC_API_URL=$(Quote-PowerShellLiteral $apiUrl); `$env:VITE_API_URL=$(Quote-PowerShellLiteral $apiUrl); `$env:PORT=$CustomerPort; Set-Location -LiteralPath $(Quote-PowerShellLiteral $CustomerPath); $CustomerCommand -- -p $CustomerPort"
$adminCommandLine = "`$env:NEXT_PUBLIC_API_URL=$(Quote-PowerShellLiteral $apiUrl); `$env:VITE_API_URL=$(Quote-PowerShellLiteral $apiUrl); `$env:PORT=$AdminPort; Set-Location -LiteralPath $(Quote-PowerShellLiteral $AdminPath); $AdminCommand -- -p $AdminPort"

Start-Process powershell.exe -ArgumentList @('-NoExit', '-Command', $apiCommand) | Out-Null
Start-Process powershell.exe -ArgumentList @('-NoExit', '-Command', $customerCommandLine) | Out-Null
Start-Process powershell.exe -ArgumentList @('-NoExit', '-Command', $adminCommandLine) | Out-Null

Write-Host ''
Write-Host 'Food trailer local demo is starting in three persistent PowerShell windows.'
Write-Host "Customer: $customerUrl"
Write-Host "Admin:    $adminUrl"
Write-Host "API:      $apiUrl"
Write-Host "Admin username: admin"
Write-Host "Admin password: $AdminPassword"
Write-Host ''
Write-Host "Stop app windows with Ctrl+C in each window. Stop the disposable database with: docker stop $containerName"
Write-Host "Remove it completely with: docker rm $containerName"
