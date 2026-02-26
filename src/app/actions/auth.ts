'use server';

export async function verifyTeacherCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const validUsername = process.env.TEACHER_USERNAME;
  const validPassword = process.env.TEACHER_PASSWORD;
  if (!validUsername || !validPassword) return false;
  return username.trim() === validUsername && password === validPassword;
}
