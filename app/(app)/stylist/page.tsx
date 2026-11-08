import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { buildContext } from '@/lib/ai/context'
import { configError, MODEL_CHAT, PROVIDER_LABEL } from '@/lib/ai/client'
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
      <p className="m">IA: {PROVIDER_LABEL()} · {MODEL_CHAT()}</p>
      {configError() && <p className="msg">{configError()}</p>}
      <ChatBox />
    </main>
  )
}
