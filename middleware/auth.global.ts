export default defineNuxtRouteMiddleware(async (to) => {
  const me = useMe()
  if (!me.value) me.value = await fetchMe()
  if (!me.value) return to.path === '/login' ? undefined : navigateTo('/login')
  // Première connexion : le mot de passe par défaut doit être remplacé avant toute chose.
  if (me.value.mustChangePassword) return to.path === '/password' ? undefined : navigateTo('/password')
  if (to.path === '/login') return navigateTo('/')
  if (to.path === '/admin' && me.value.role !== 'admin') return navigateTo('/')
})
