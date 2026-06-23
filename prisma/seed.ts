import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function bootstrapHome(userId: string) {
  const existing = await prisma.fsNode.findFirst({
    where: { ownerId: userId, parentId: null, name: 'home', isDeleted: false },
  });
  if (existing) return;

  const home = await prisma.fsNode.create({
    data: {
      name: 'home',
      type: 'DIRECTORY',
      ownerId: userId,
      path: '/home',
      size: 0,
      permissions: {
        create: { userId, level: 'OWNER', grantedBy: userId },
      },
    },
  });

  const dirs = ['Documents', 'Downloads', 'Desktop'];
  for (const dir of dirs) {
    await prisma.fsNode.create({
      data: {
        name: dir,
        type: 'DIRECTORY',
        parentId: home.id,
        ownerId: userId,
        path: `/home/${dir}`,
        size: 0,
        permissions: {
          create: { userId, level: 'OWNER', grantedBy: userId },
        },
      },
    });
  }

  const welcomeContent =
    'Welcome to BrowserOS!\n\nThis is your home directory. Feel free to create files and folders.';
  await prisma.fsNode.create({
    data: {
      name: 'Welcome.txt',
      type: 'FILE',
      parentId: home.id,
      ownerId: userId,
      path: '/home/Welcome.txt',
      content: welcomeContent,
      mimeType: 'text/plain',
      size: Buffer.byteLength(welcomeContent, 'utf8'),
      permissions: {
        create: { userId, level: 'OWNER', grantedBy: userId },
      },
    },
  });
}

async function main() {
  console.log('Seeding database…');

  const adminHash = await argon2.hash('Admin123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@browseros.local' },
    update: {},
    create: {
      email: 'admin@browseros.local',
      username: 'admin',
      displayName: 'Admin',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  console.log(`Admin user: ${admin.email} (password: Admin123!)`);

  const demoHash = await argon2.hash('Demo1234!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const demo = await prisma.user.upsert({
    where: { email: 'demo@browseros.local' },
    update: {},
    create: {
      email: 'demo@browseros.local',
      username: 'demouser',
      displayName: 'Demo User',
      passwordHash: demoHash,
    },
  });

  console.log(`Demo user: ${demo.email} (password: Demo1234!)`);

  await bootstrapHome(admin.id);
  await bootstrapHome(demo.id);

  console.log('Seed complete.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
