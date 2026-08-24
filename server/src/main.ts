import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Which portal the browser is on is derived from the host prefix
  // (`student.` / `lehrer.` / …), so testing a non-admin portal locally means
  // browsing `student.localhost:3000` rather than `localhost:3000`. Browsers
  // resolve `*.localhost` to the loopback address on their own, but the origin
  // still has to be allowed here. Development only — production keeps the
  // explicit list below and nothing else.
  const devOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : [
          'http://student.localhost:3000',
          'http://lehrer.localhost:3000',
          'http://invoice.localhost:3000',
          'http://form.localhost:3000',
        ];

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://client-brown-ten-36.vercel.app',
      'https://admin.dafzentrum.uz',
      'https://lehrer.dafzentrum.uz',
      'https://student.dafzentrum.uz',
      'https://invoice.dafzentrum.uz',
      'https://form.dafzentrum.uz',
      ...devOrigins,
    ],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 4000);
}

// A failed bootstrap must read as a sentence, not as a stack trace. The most
// likely cause by far is a missing environment variable (`ConfigModule`'s
// `validate` throws before anything else runs), and that message is written to
// be actionable — an unhandled rejection would bury it under an
// UnhandledPromiseRejection frame in the Railway deploy log.
bootstrap().catch((error) => {
  console.error(
    `\nServer ishga tushmadi:\n${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});
