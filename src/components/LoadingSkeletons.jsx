function SkeletonBar({ className = '', dark = false }) {
  return <div className={`${dark ? 'bg-white/10' : 'bg-slate-200'} rounded-full ${className}`} />
}

export function ListPanelSkeleton({
  label = 'Carregando conteúdo',
  dark = false,
  rows = 4,
  showHeader = true,
  className = '',
} = {}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={[
        'overflow-hidden rounded-[22px] border shadow-sm',
        dark ? 'border-white/10 bg-[#050b14]' : 'border-slate-200 bg-white',
        className,
      ].join(' ')}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        {showHeader ? (
          <div className={`border-b px-4 py-4 ${dark ? 'border-white/10 bg-[#07111f]' : 'border-slate-100 bg-slate-50'}`}>
            <SkeletonBar dark={dark} className="h-3 w-24" />
            <SkeletonBar dark={dark} className="mt-3 h-6 w-44 max-w-[65%]" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((item) => (
                <SkeletonBar key={item} dark={dark} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2.5 p-3">
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={index}
              className={`flex min-h-[72px] items-center gap-3 rounded-2xl border p-3 ${dark ? 'border-white/10 bg-white/[0.045]' : 'border-slate-100 bg-slate-50'}`}
            >
              <div className={`h-11 w-11 shrink-0 rounded-full ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
              <div className="min-w-0 flex-1">
                <SkeletonBar dark={dark} className="h-3.5 w-2/5" />
                <SkeletonBar dark={dark} className="mt-2 h-3 w-4/5" />
                <SkeletonBar dark={dark} className="mt-2 h-2.5 w-3/5" />
              </div>
              <SkeletonBar dark={dark} className="h-6 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ChatScreenSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex h-full min-h-0 flex-col bg-[#050b12] text-white">
      <span className="sr-only">Carregando conversa e confirmando acesso</span>
      <div aria-hidden="true" className="flex h-full min-h-0 flex-col motion-safe:animate-pulse">
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/10 bg-[#07111f] px-3 md:h-[82px] md:px-5">
          <div className="h-11 w-11 rounded-2xl bg-white/10" />
          <div className="min-w-0 flex-1">
            <SkeletonBar dark className="h-4 w-36 max-w-[55%]" />
            <SkeletonBar dark className="mt-2 h-2.5 w-24" />
          </div>
          <div className="h-10 w-10 rounded-2xl bg-white/[0.07]" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-3 py-4 md:px-5">
          <div className="w-[72%] max-w-md rounded-[20px] rounded-bl-md bg-white/[0.07] p-3">
            <SkeletonBar dark className="h-3 w-4/5" />
            <SkeletonBar dark className="mt-2 h-3 w-3/5" />
          </div>
          <div className="ml-auto w-[64%] max-w-sm rounded-[20px] rounded-br-md bg-blue-500/20 p-3">
            <SkeletonBar dark className="h-3 w-full" />
            <SkeletonBar dark className="mt-2 h-3 w-1/2" />
          </div>
          <div className="w-[55%] max-w-xs rounded-[20px] rounded-bl-md bg-white/[0.07] p-3">
            <SkeletonBar dark className="h-3 w-3/4" />
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#07111f] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-5">
          <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3">
            <div className="h-7 w-7 rounded-full bg-white/10" />
            <SkeletonBar dark className="h-3 flex-1" />
            <div className="h-8 w-8 rounded-xl bg-blue-500/25" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ClientHomeSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="overflow-hidden rounded-[24px] border border-blue-100 bg-white p-4 shadow-sm">
      <span className="sr-only">Carregando início do cliente</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="rounded-[22px] bg-gradient-to-br from-blue-100 to-cyan-50 p-4">
          <SkeletonBar className="h-3 w-28 bg-blue-200" />
          <SkeletonBar className="mt-3 h-7 w-3/4 bg-blue-200" />
          <SkeletonBar className="mt-3 h-4 w-1/2 bg-blue-100" />
          <SkeletonBar className="mt-5 h-12 w-full rounded-2xl bg-white/80" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-24 rounded-[18px] border border-slate-100 bg-slate-50" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProfileDrawerSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="fixed inset-0 z-[100000] overflow-hidden bg-white dark:bg-[#050b12]">
      <span className="sr-only">Carregando perfil</span>
      <div aria-hidden="true" className="h-full w-full motion-safe:animate-pulse">
        <div className="border-b border-slate-100 px-3 py-3 dark:border-white/10">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-slate-200 dark:bg-white/10" />
            <div className="flex-1">
              <SkeletonBar className="h-4 w-36 dark:bg-white/10" />
              <SkeletonBar className="mt-2 h-3 w-52 max-w-[65%] dark:bg-white/10" />
            </div>
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07]" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl p-3 md:p-6">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => <div key={item} className="h-10 rounded-xl bg-slate-100 dark:bg-white/[0.07]" />)}
          </div>
          <div className="mt-5 space-y-3">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 rounded-2xl bg-slate-100 dark:bg-white/[0.07]" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FullScreenModalSkeleton({ label = 'Carregando janela' } = {}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="fixed inset-0 z-[100200] bg-white text-slate-950 dark:bg-[#050b12]">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="mx-auto flex h-[100dvh] w-full max-w-[720px] flex-col px-4 py-3 motion-safe:animate-pulse md:px-8 md:py-8">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-white/[0.07]" />
          <SkeletonBar className="h-3 w-24 dark:bg-white/10" />
        </div>
        <SkeletonBar className="mt-6 h-7 w-3/5 bg-blue-100 dark:bg-blue-500/20" />
        <SkeletonBar className="mt-3 h-3 w-4/5 dark:bg-white/10" />
        <div className="mt-5 h-28 rounded-[20px] bg-slate-100 dark:bg-white/[0.07]" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-100 dark:bg-white/[0.07]" />)}
        </div>
        <div className="mt-auto h-12 rounded-2xl bg-blue-200 dark:bg-blue-500/25" />
      </div>
    </div>
  )
}

export function ModalCardSkeleton({ label = 'Carregando janela' } = {}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="fixed inset-0 z-[100000] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="w-full max-w-md rounded-[24px] border border-white/15 bg-white p-4 shadow-2xl motion-safe:animate-pulse dark:bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20" />
          <div className="flex-1">
            <SkeletonBar className="h-4 w-2/5 dark:bg-white/10" />
            <SkeletonBar className="mt-2 h-3 w-3/4 dark:bg-white/10" />
          </div>
        </div>
        <div className="mt-5 h-24 rounded-2xl bg-slate-100 dark:bg-white/[0.07]" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-11 rounded-xl bg-slate-100 dark:bg-white/[0.07]" />
          <div className="h-11 rounded-xl bg-blue-200 dark:bg-blue-500/25" />
        </div>
      </div>
    </div>
  )
}
