'use client'

import Link from 'next/link'
import { CheckCircle, Home } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { Separator } from '@/components/ui/separator'
import { useTranslations } from 'next-intl'

export default function SuccessSubscriptionPage() {
  const t = useTranslations('subscription')

  // フェードインアニメーションの設定
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.4, 0, 0.2, 1] as const,
        staggerChildren: 0.2,
      },
    },
  }

  return (
    <div className="flex min-h-[65dvh] items-center justify-center py-6">
      <motion.div
        className="w-full max-w-3xl"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <Card className="overflow-hidden rounded-2xl border-border shadow-sm">
          <div className="h-1 bg-primary"></div>
          <CardContent className="px-5 pb-8 pt-8 sm:px-8">
            <motion.div className="text-center space-y-6" variants={containerVariants}>
              <motion.div className="inline-flex p-4 rounded-full bg-success-foreground">
                <CheckCircle className="w-16 h-16 text-success" />
              </motion.div>

              <motion.div>
                <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {t('success.title')}
                </h1>
              </motion.div>

              <Separator className="my-6" />

              <motion.p className="text-base font-medium text-pretty text-muted-foreground">
                {t('success.congratulations')}
                <br />
                {t('success.allFeaturesAvailable')}
              </motion.p>

              <motion.div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
                <Button asChild className="min-h-11 rounded-lg text-primary-foreground shadow-none">
                  <Link href={`/dashboard`}>
                    <span className="flex items-center">
                      <Home className="w-4 h-4 mr-2" />
                      {t('success.backToDashboard')}
                    </span>
                  </Link>
                </Button>
              </motion.div>

              <motion.div className="mt-8 bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {t('success.billingInfo')}
                  <Link
                    className="text-link-foreground hover:text-primary underline mx-1 font-medium"
                    href={`/dashboard/subscription`}
                  >
                    {t('success.subscriptionPageLink')}
                  </Link>
                  {t('success.canBeDone')}
                </p>
              </motion.div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
