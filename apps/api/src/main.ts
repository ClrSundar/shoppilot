import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { PlatformAdminRole } from '@prisma/client';

async function seedSuperAdmin(prisma: PrismaService) {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.warn('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set — skipping super admin seed');
    return;
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log('Super admin already exists — skipping seed');
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.platformAdmin.create({
    data: {
      name,
      email,
      password: hashed,
      role: PlatformAdminRole.SUPER_ADMIN,
    },
  });

  console.log(`Super admin created: ${email}`);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3001', /\.vercel\.app$/],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('ShopPilot API')
    .setDescription('ShopPilot Backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Seed super admin after app starts
  const prisma = app.get(PrismaService);
  await seedSuperAdmin(prisma);

  console.log(`Application is running on port: ${port}`);
}

void bootstrap();
