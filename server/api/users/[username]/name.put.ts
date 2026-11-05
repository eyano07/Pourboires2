import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireUser } from '../../../lib/session'
import { renameUser } from '../../../lib/users'
import { asHttp } from '../../../lib/userRoute'
import { publishTips } from '../../../lib/live'

/** L'administrateur modifie les noms complets d'un compte. */
export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['admin'] })
  const body = await readBody(event)
  const result = await asHttp(() => renameUser(getRouterParam(event, 'username') ?? '', body?.name))
  await publishTips() // les écrans ouverts affichent le nouveau nom
  return result
})
