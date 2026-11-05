export interface Me { username: string, name: string, role: 'admin' | 'caissier' | 'lecteur', mustChangePassword: boolean }

export const useMe = () => useState<Me | null>('me', () => null)

export async function fetchMe(): Promise<Me | null> {
  try {
    return await $fetch<Me>('/api/auth/me', { headers: useRequestHeaders(['cookie']) })
  } catch { return null }
}

export const roleLabel = (r: Me['role']) => ({ admin: 'Administrateur', caissier: 'Caissier', lecteur: 'Lecteur' })[r]
