import { login, signup } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string }> }) {
  const { error, info } = await searchParams
  return (
    <main className="narrow" style={{ paddingTop: '12vh' }}>
      <p className="eyebrow">Estudio de estilismo privado</p>
      <h1 className="display">Mi <em style={{ color: 'var(--acc)' }}>estilista</em></h1>
      <p className="lead">Un estilista que te conoce, justifica lo que recomienda y trabaja con tu armario real.</p>
      <div className="tape" aria-hidden="true" />
      <form className="stack">
        {error && <p className="note warn">{error}</p>}
        {info && <p className="note">{info}</p>}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Contraseña<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
        <div className="btns">
          <button className="btn primary" formAction={login}>Entrar</button>
          <button className="btn" formAction={signup}>Crear cuenta</button>
        </div>
      </form>
    </main>
  )
}
