import type { ImgHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'
import logoBlack from '../../../../resources/logo_black.svg'
import logoWhite from '../../../../resources/logo_white.svg'

type LogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>

export function Logo({ className, alt = '', ...props }: LogoProps): React.JSX.Element {
  return (
    <>
      <img {...props} src={logoBlack} alt={alt} className={cn(className, 'dark:hidden')} />
      <img {...props} src={logoWhite} alt={alt} className={cn(className, 'hidden dark:block')} />
    </>
  )
}
