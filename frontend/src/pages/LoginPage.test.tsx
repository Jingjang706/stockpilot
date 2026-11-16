import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
import { ApiError } from '../lib/api'

const login = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login }) }))

function setup() {
  render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

describe('LoginPage', () => {
  beforeEach(() => { login.mockReset() })

  it('asks for both fields before calling the API', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your username and password.')
    expect(login).not.toHaveBeenCalled()
  })

  it('shows the server error for bad credentials', async () => {
    login.mockImplementation(() => Promise.reject(new ApiError(401, 'Invalid username or password')))
    setup()
    await userEvent.type(screen.getByLabelText('Username'), 'admin')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password')
  })

  it('submits trimmed credentials', async () => {
    login.mockResolvedValue({ role: 'ADMIN', mustChangePassword: false })
    setup()
    await userEvent.type(screen.getByLabelText('Username'), '  admin ')
    await userEvent.type(screen.getByLabelText('Password'), 'Admin@12345')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'Admin@12345'))
  })

  it('fills the demo credentials on request', async () => {
    setup()
    await userEvent.click(screen.getAllByRole('button', { name: 'Fill' })[2])
    expect(screen.getByLabelText('Username')).toHaveValue('cashier')
  })
})
