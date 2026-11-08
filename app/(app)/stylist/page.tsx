import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { buildContext } from '@/lib/ai/context'
import { ChatBox } from './chat-box'

export default async function StylistPage() {
  const user = (await getUser())!
  const ctx = buildContext(await loadBundle(user.supabase, user.id))
  return (
    <main>
      <h2>Mi estilista</h2>
      <p className="m">
        {ctx.hasValidated ? 'Consulto tu perfil validado y tu armario real.' : 'Todavía no hay nada validado: trabajaré con hipótesis y te lo diré.'}
      </p>
      <ChatBox />
    </main>
  )
}
