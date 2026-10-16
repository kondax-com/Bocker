const domain = process.env.CLERK_JWT_ISSUER_DOMAIN
const applicationID = process.env.NEXT_PUBLIC_CONVEX_AUD

if (!domain?.trim()) {
  throw new Error('CLERK_JWT_ISSUER_DOMAIN is required')
}
if (!applicationID?.trim()) {
  throw new Error('NEXT_PUBLIC_CONVEX_AUD is required')
}

const authConfig = {
  providers: [
    {
      domain,
      applicationID,
    },
  ],
}

export default authConfig
