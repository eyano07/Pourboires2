export interface Me { username: string, role: 'caissier' | 'lecteur' }

export const useMe = () => useState<Me | null>('me', () => null)

export async function fetchMe(): Promise<Me | null> {
  try {
    return await $fetch<Me>('/api/auth/me', { headers: useRequestHeaders(['cookie']) })
  } catch { return null }
}
