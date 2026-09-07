/**
 * Layout primitives — Root, Stack, Row, Container, CenterScreen, Divider.
 *
 * `Root` applies the design-system base styles (background, font, reset). Wrap
 * your app — or any showcase — in it once:
 *
 *   <Root grain>
 *     <Container> … </Container>
 *   </Root>
 */
import React from 'react'

export function Root({ grain = false, className = '', children, ...rest }) {
  const cls = ['dk-root', grain ? 'dk-grain' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}

export function Stack({ gap = 4, className = '', children, ...rest }) {
  const cls = ['dk-stack', `dk-stack-${gap}`, className].filter(Boolean).join(' ')
  return <div className={cls} {...rest}>{children}</div>
}

export function Row({ gap = 3, className = '', children, ...rest }) {
  const cls = ['dk-row', `dk-row-${gap}`, className].filter(Boolean).join(' ')
  return <div className={cls} {...rest}>{children}</div>
}

export function Container({ narrow = false, className = '', children, ...rest }) {
  const cls = [narrow ? 'dk-container-narrow' : 'dk-container', className].filter(Boolean).join(' ')
  return <div className={cls} {...rest}>{children}</div>
}

export function CenterScreen({ className = '', children, ...rest }) {
  return (
    <div className={`dk-center-screen ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function Divider({ className = '', ...rest }) {
  return <hr className={`dk-divider ${className}`} {...rest} />
}
