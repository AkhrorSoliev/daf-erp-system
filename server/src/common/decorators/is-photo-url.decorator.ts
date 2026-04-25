import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsPhotoUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhotoUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined || value === '')
            return true;
          if (typeof value !== 'string') return false;
          return /^https?:\/\//i.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an http(s) URL — blob:, data:, and other schemes are not allowed`;
        },
      },
    });
  };
}
