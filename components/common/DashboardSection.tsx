import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
interface SectionContainerProps {
  children: React.ReactNode
  title?: string
  backLink: string
  backLinkTitle: string
  infoBtn?: {
    text: string
    link: string
  }
  subBtn?: {
    text: string
    link: string
  }
}

export default function DashboardSection({
  children,
  title,
  backLink,
  backLinkTitle,
  infoBtn,
  subBtn,
}: SectionContainerProps) {
  return (
    <div className="mx-auto w-full min-w-0">
      <header className="mb-7 flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:basis-64">
          <Link
            href={backLink}
            className="inline-flex min-h-9 w-fit items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{backLinkTitle}</span>
          </Link>
          {title && (
            <h1 className="break-words text-balance text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
          )}
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {infoBtn && (
            <Button
              asChild
              className="h-auto min-h-11 max-w-full whitespace-normal rounded-lg px-5 text-left shadow-none"
            >
              <Link href={infoBtn.link}>{infoBtn.text}</Link>
            </Button>
          )}
          {subBtn && (
            <Button
              asChild
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal rounded-lg px-5 text-left shadow-none"
            >
              <Link href={subBtn.link}>{subBtn.text}</Link>
            </Button>
          )}
        </div>
      </header>
      <div className="min-w-0 pb-8">{children}</div>
    </div>
  )
}
