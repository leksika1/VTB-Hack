export class ApiError extends Error {
  readonly field?: string;
  readonly status?: number;

  constructor(message: string, field?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.field = field;
    this.status = status;
  }
}

/** Ошибка 409 от «Оплатить сейчас» с доступной интерфейсу суммой нехватки. */
export class SharedAccountShortageError extends ApiError {
  readonly shortage: number;

  constructor(shortage: number) {
    const formatted = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(shortage);
    super(`На общем счёте не хватает ${formatted} ₽`, undefined, 409);
    this.name = 'SharedAccountShortageError';
    this.shortage = shortage;
  }
}
