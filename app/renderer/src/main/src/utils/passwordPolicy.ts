const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[.<>?;:[\]{}~!@#$%^&*()_+\-="])[A-Za-z\d.<>?;:[\]{}~!@#$%^&*()_+\-="]{8,20}$/

export const isStrongPassword = (value: unknown): value is string => {
  return typeof value === 'string' && PASSWORD_PATTERN.test(value)
}
