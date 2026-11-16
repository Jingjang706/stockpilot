import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Form'
import { homeFor } from '../components/ProtectedRoute'

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'At least 8 characters').max(72, 'At most 72 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter').regex(/\d/, 'Include at least one digit'),
  confirm: z.string(),
}).refine(v => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Form = z.infer<typeof passwordSchema>

export default function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(passwordSchema) })

  async function onSubmit(v: Form) {
    setServerError(null)
    try {
      await api.post('/api/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword })
      await refresh()
      toast.success('Password updated')
      navigate(user ? homeFor(user.role) : '/', { replace: true })
    } catch (e) { setServerError(e instanceof ApiError ? e.message : 'Could not change the password') }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4 rounded-2xl border bg-surface p-6 shadow-card" noValidate>
        <div>
          <h1 className="text-xl font-semibold">Change your password</h1>
          <p className="mt-1 text-sm text-muted">{user?.mustChangePassword ? 'Your password was set by an administrator. Choose a new one to continue.' : 'Choose a new password.'}</p>
        </div>
        {serverError && <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{serverError}</div>}
        <Input label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
        <Input label="New password" type="password" autoComplete="new-password" error={errors.newPassword?.message} hint="8+ characters with a letter and a digit" {...register('newPassword')} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">Update password</Button>
        <button type="button" onClick={async () => { await logout(); navigate('/login') }} className="w-full text-center text-sm text-muted hover:text-ink">Sign out</button>
      </form>
    </div>
  )
}
