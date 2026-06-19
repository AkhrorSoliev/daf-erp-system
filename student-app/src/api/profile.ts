import { api } from './client';

/** POST /api/student-portal/photo — multipart upload of a local image URI. */
export async function uploadPhoto(uri: string) {
  const name = uri.split('/').pop() ?? 'photo.jpg';
  const ext = name.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';

  const form = new FormData();
  // React Native FormData file shape.
  form.append('file', { uri, name, type } as unknown as Blob);

  const { data } = await api.post('/student-portal/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** DELETE /api/student-portal/photo — removes the student's avatar. */
export async function deletePhoto() {
  const { data } = await api.delete('/student-portal/photo');
  return data;
}
