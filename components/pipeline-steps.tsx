import { BarChart3, Layers, Search, ShoppingBag } from 'lucide-react'

const steps = [
  {
    icon: Search,
    title: 'Detect unmet demand',
    body: 'Analyze permitted search, review, and catalog data to find recurring needs existing products do not satisfy.',
  },
  {
    icon: Layers,
    title: 'Generate a real product',
    body: 'Create an eligible physical product, such as table linens, pillows, or scarves, with its actual guaranteed price.',
  },
  {
    icon: ShoppingBag,
    title: 'Turn it into a sponsored concept',
    body: 'Show the design in a relevant shopping context. Shoppers express purchase intent or join a launch list.',
  },
  {
    icon: BarChart3,
    title: 'Measure demand before scaling',
    body: 'Compare engagement and qualified intent across concepts, using randomized exposure and control groups where possible.',
  },
]

export function PipelineSteps() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
      {steps.map(({ icon: Icon, title, body }, index) => (
        <li key={title} className="flex flex-col gap-3 bg-background p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm text-muted-foreground">
              Step {index + 1}
            </span>
          </div>
          <h3 className="font-serif text-xl">{title}</h3>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        </li>
      ))}
    </ol>
  )
}
