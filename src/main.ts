import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });
  app.enableCors({
    allowedHeaders: '*',
    origin: '*',
    credentials: true
  })
  await app.listen(8080);
}
bootstrap();
