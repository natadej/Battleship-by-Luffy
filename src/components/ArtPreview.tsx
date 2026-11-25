/** Only present on this concept branch; links keep before/after easy to compare. */
export function ArtPreview() {
  const original = document.documentElement.dataset.art === 'original'
  const artLink = (art: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('art', art)
    return `${url.pathname}${url.search}${url.hash}`
  }
  return (
    <>
      <nav className="art-preview" aria-label="Art preview">
        <span>ART STUDY <i /> NOT LIVE</span>
        <div>
          <a href={artLink('original')} aria-current={original ? 'page' : undefined}>Original</a>
          <a href={artLink('cartoon')} aria-current={!original ? 'page' : undefined}>Cartoon blend</a>
        </div>
      </nav>
      <div className="captain-art" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}art/captain.svg`} alt="" />
      </div>
      <p className="art-eyebrow">THE OCEAN IS YOUR PLAYGROUND</p>
    </>
  )
}
