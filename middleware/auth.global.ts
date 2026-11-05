export default defineNuxtRouteMiddleware(async (to) => {
  const me = useMe()
  if (!me.value) me.value = await fetchMe()
  if (!me.value && to.path !== '/login') return navigateTo('/login')
  if (me.value && to.path === '/login') return navigateTo('/')
})
