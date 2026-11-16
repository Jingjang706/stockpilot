import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, Copy, KeyRound, Pencil, Plus } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { AppUser, CredentialResponse, Role } from '../lib/types'
import { formatDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Form'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'CASHIER']

const createSchema = z.object({
  username: z.string().trim().min(3, 'At least 3 characters').max(50).regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, dot, underscore, dash only'),
  fullName: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().min(1, 'Email is required').regex(/^\S+@\S+\.\S+$/, 'Enter a valid email').max(150),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
})
type CreateValues = z.infer<typeof createSchema>

function TempPassword({ title, creds, onClose }: { title: string; creds: CredentialResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal open title={title} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-3 text-sm">
        <p>Share this temporary password with <span className="font-medium">{creds.user.fullName}</span> ({creds.user.username}) through a secure channel. <span className="font-medium">It is shown only once</span> and must be changed at first sign-in.</p>
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-raised px-3 py-2">
          <code className="select-all font-mono text-base">{creds.temporaryPassword}</code>
          <Button size="sm" onClick={async () => { await navigator.clipboard?.writeText(creds.temporaryPassword); setCopied(true) }}>{copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</Button>
        </div>
      </div>
    </Modal>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: CredentialResponse) => void }) {
  const toast = useToast()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { role: 'CASHIER' } })
  async function onSubmit(v: CreateValues) {
    try { onCreated(await api.post<CredentialResponse>('/api/users', v)) } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not create the account') }
  }
  return (
    <Modal open title="Add employee" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Create account</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Full name" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Username" autoComplete="off" error={errors.username?.message} {...register('username')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Select label="Role" error={errors.role?.message} {...register('role')}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</Select>
        <p className="text-xs text-muted">A one-time temporary password is generated for the new account.</p>
      </form>
    </Modal>
  )
}

function EditModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [role, setRole] = useState<Role>(user.role)
  const [active, setActive] = useState(user.active)
  const [fullName, setFullName] = useState(user.fullName)
  const [email, setEmail] = useState(user.email)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try { await api.put(`/api/users/${user.id}`, { fullName, email, role, active }); toast.success('Employee updated'); onSaved() }
    catch (e) { toast.error(e instanceof ApiError ? (e.fieldErrors ? Object.values(e.fieldErrors)[0] : e.message) : 'Could not update') } finally { setBusy(false) }
  }
  return (
    <Modal open title={`Edit ${user.username}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Full name" value={fullName} onChange={e => setFullName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Select label="Role" value={role} onChange={e => setRole(e.target.value as Role)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Account active (can sign in)</label>
      </div>
    </Modal>
  )
}

export default function EmployeesPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => api.get<AppUser[]>('/api/users'), [])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [resetting, setResetting] = useState<AppUser | null>(null)
  const [creds, setCreds] = useState<{ title: string; value: CredentialResponse } | null>(null)
  const [busy, setBusy] = useState(false)

  async function reset() {
    if (!resetting) return
    setBusy(true)
    try {
      const value = await api.post<CredentialResponse>(`/api/users/${resetting.id}/reset-password`)
      setResetting(null); setCreds({ title: 'Password reset', value }); reload()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not reset the password') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Employees" subtitle="Accounts, roles and access" actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add employee</Button>} />
      <Card padded={false}>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data || data.length === 0 ? <EmptyState title="No employees" /> : (
          <div className="overflow-x-auto"><table className={tableClass}>
            <thead className={theadClass}><tr><th className={thClass}>Employee</th><th className={thClass}>Username</th><th className={thClass}>Role</th><th className={thClass}>Status</th><th className={thClass}>Last sign-in</th><th className={`${thClass} text-right`}>Actions</th></tr></thead>
            <tbody>{data.map(u => (
              <tr key={u.id} className={trClass}>
                <td className={tdClass}><div className="font-medium">{u.fullName}{u.id === me?.id && <span className="ml-2 text-xs text-muted">(you)</span>}</div><div className="text-xs text-muted">{u.email}</div></td>
                <td className={`${tdClass} font-mono text-xs`}>{u.username}</td>
                <td className={tdClass}><Badge tone={u.role === 'ADMIN' ? 'accent' : 'neutral'}>{u.role}</Badge></td>
                <td className={tdClass}><div className="flex gap-1"><Badge tone={u.active ? 'good' : 'bad'}>{u.active ? 'Active' : 'Deactivated'}</Badge>{u.mustChangePassword && <Badge tone="warn">Password change pending</Badge>}</div></td>
                <td className={`${tdClass} text-muted`}>{formatDateTime(u.lastLoginAt)}</td>
                <td className={`${tdClass} text-right`}><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${u.username}`} onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Reset password for ${u.username}`} onClick={() => setResetting(u)}><KeyRound className="h-4 w-4" /></Button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={c => { setCreating(false); setCreds({ title: 'Account created', value: c }); reload() }} />}
      {editing && <EditModal user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {creds && <TempPassword title={creds.title} creds={creds.value} onClose={() => setCreds(null)} />}
      <ConfirmDialog open={!!resetting} danger loading={busy} title="Reset password?" confirmLabel="Reset password"
        message={<>A new temporary password will be generated for <span className="font-medium text-ink">{resetting?.fullName}</span>. Their current password stops working immediately and they must choose a new one at next sign-in.</>}
        onCancel={() => setResetting(null)} onConfirm={reset} />
    </>
  )
}
