import '../styles/Spinner.css'

function Spinner({ label = 'Loading', fullscreen = false }) {
  return (
    <div className={fullscreen ? 'spinner-wrap spinner-fullscreen' : 'spinner-wrap'}>
      <div className="spinner-ring" />
      {label && <p className="spinner-label">{label}</p>}
    </div>
  )
}

export default Spinner
