# Forms & Validation

Form handling with react-hook-form and Zod schema validation.

---

## Stack

| Library | Purpose |
|---------|---------|
| `react-hook-form` | Form state management, controlled inputs |
| `Zod` | Schema declaration and validation |
| `@hookform/resolvers` | Connects Zod schemas to react-hook-form |

## Form Pattern

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, "Ism kiritilishi shart"),
  phone: z.string().length(9, "Telefon 9 ta raqam bo'lishi kerak"),
});

type FormData = z.infer<typeof schema>;

function MyForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    // API call
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('name')} />
      {errors.name && <p>{errors.name.message}</p>}
    </form>
  );
}
```

## Validation Schemas

### Student Schema

```typescript
const editStudentSchema = z.object({
  firstName: z.string().min(1, "Ism kiritilishi shart"),
  lastName: z.string().min(1, "Familiya kiritilishi shart"),
  phone: z.string().length(9, "Telefon 9 ta raqam bo'lishi kerak"),
  telegram: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  avatar: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  address: z.string().optional(),
  passportSeries: z.string().optional(),
  placeOfStudy: z.string().optional(),
  login: z.string().optional(),
  password: z.string().optional(),
});
```

### Teacher Schema

```typescript
const editTeacherSchema = z.object({
  firstName: z.string().min(1, "Ism kiritilishi shart"),
  lastName: z.string().min(1, "Familiya kiritilishi shart"),
  phone: z.string().length(9, "Telefon 9 ta raqam bo'lishi kerak"),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  avatar: z.string().optional(),
  login: z.string().optional(),
  password: z.string().optional(),
});
```

### Lead to Student Schema

```typescript
const addStudentFromLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().length(9),
  groupId: z.string().min(1, "Guruh tanlanishi shart"),
});
```

## Custom Input Components

### PhoneInput

Used with `Controller` from react-hook-form:

```typescript
<Controller
  name="phone"
  control={control}
  render={({ field }) => (
    <PhoneInput
      value={field.value}
      onChange={field.onChange}
    />
  )}
/>
```

- Auto-adds `+998` prefix
- Formats as `XX XXX XX XX`
- Stores raw 9 digits

### PriceInput

```typescript
<Controller
  name="price"
  control={control}
  render={({ field }) => (
    <PriceInput
      value={field.value}
      onChange={field.onChange}
    />
  )}
/>
```

- Auto-formats with comma separators
- Stores raw integer value

## Validation Messages

All validation messages are in **Uzbek**:

| English | Uzbek |
|---------|-------|
| Name is required | Ism kiritilishi shart |
| Last name is required | Familiya kiritilishi shart |
| Phone must be 9 digits | Telefon 9 ta raqam bo'lishi kerak |
| Group is required | Guruh tanlanishi shart |

## Error Display

Errors appear below the corresponding input field:

```typescript
{errors.fieldName && (
  <p className="text-sm text-destructive mt-1">
    {errors.fieldName.message}
  </p>
)}
```
