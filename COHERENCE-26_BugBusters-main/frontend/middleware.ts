import { authMiddleware } from '@clerk/nextjs/server'

export default authMiddleware({
  // Add any public routes here that don't need auth
  publicRoutes: ['/sign-in', '/sign-up'],
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}