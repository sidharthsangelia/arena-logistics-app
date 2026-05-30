import { fmt } from '@/utils/helpers'
import React from 'react'

interface StatsProps {
  stats: {
    count: number
    cheapest?: {
      totalWithTax: number
      currency: string
    }
    fastest?: {
      tatDays: number
    }
  }
}

export default function Stats({ stats }: StatsProps) {
  return (
    <div className="flex flex-wrap items-center gap-8 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div>
        <p className="text-xs text-slate-500">Quotes</p>
        <p className="text-lg font-semibold text-slate-900">
          {stats.count}
        </p>
      </div>
    
      <div>
        <p className="text-xs text-slate-500">Lowest Cost</p>
        <p className="text-lg font-semibold text-slate-900">
          {stats.cheapest
            ? fmt(stats.cheapest.totalWithTax, stats.cheapest.currency)
            : "—"}
        </p>
      </div>
    
      <div>
        <p className="text-xs text-slate-500">Fastest Transit</p>
        <p className="text-lg font-semibold text-slate-900">
          {stats.fastest ? `${stats.fastest.tatDays} days` : "—"}
        </p>
      </div>
    </div>
  )
}
