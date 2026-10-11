import { PipelineSteps } from '@/components/pipeline-steps'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-4">
        <p className="text-sm uppercase tracking-widest text-primary">
          DynamicShop
        </p>
        <h1 className="text-balance font-serif text-4xl leading-tight sm:text-5xl">
          Products designed from what shoppers can&apos;t yet find.
        </h1>
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          We detect unmet demand, generate a real product with a guaranteed
          price, and measure genuine purchase intent before anything scales.
        </p>
      </header>
      <PipelineSteps />
    </main>
  )
}
