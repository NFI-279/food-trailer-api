-- Local demo seed. Run after `prisma migrate deploy`.
INSERT INTO "User" ("id", "username", "password", "role")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  '$2b$10$REPLACE_WITH_BCRYPT_HASH',
  'ADMIN'
)
ON CONFLICT ("username") DO UPDATE SET "password" = EXCLUDED."password", "role" = EXCLUDED."role";

INSERT INTO "MenuItem" (
  "id", "name", "description", "price", "category", "isAvailable", "imageUrl",
  "inventoryItemId", "inventoryDeduction", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  'Demo Burger',
  'Local demo menu item',
  25.00,
  'Grill',
  TRUE,
  '',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "price" = EXCLUDED."price",
  "category" = EXCLUDED."category",
  "isAvailable" = EXCLUDED."isAvailable",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Settings" (
  "id", "isAcceptingOrders", "openTime", "closeTime", "overrideOpen",
  "muteKitchenDing", "adminLanguage", "updatedAt"
) VALUES (
  'GLOBAL',
  TRUE,
  '00:00',
  '23:59',
  TRUE,
  FALSE,
  'en',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "isAcceptingOrders" = EXCLUDED."isAcceptingOrders",
  "openTime" = EXCLUDED."openTime",
  "closeTime" = EXCLUDED."closeTime",
  "overrideOpen" = EXCLUDED."overrideOpen",
  "updatedAt" = CURRENT_TIMESTAMP;
