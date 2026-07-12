// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 1. Create a connection pool to Neon
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // 2. Wrap it in the Prisma Adapter
    const adapter = new PrismaPg(pool);
    
    // 3. Pass the adapter to the Prisma Client!
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}