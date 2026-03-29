'use client'

export default function MapinhaModal({
  onClickUser,
  open,
  onClose,
  pedidoLocal,
  onlineUsers = [],
  limitOnlineMarkers = 30,
  myUid
}) {

  if (!open) return null

  return (
    <>
      {onlineUsers.map((m) => (
        <Marker
          key={`on_${m.id}`}
          position={[m.lat, m.lng]}
          icon={icon}
          eventHandlers={{
            click: () => onClickUser?.(m)
          }}
        >
          <Popup>
            <div className="text-sm">
              <b>{m.nome}</b>
            </div>
          </Popup>
        </Marker>
      ))}

      {start && (
        <Marker
          position={start}
          icon={getNeonDotIcon('me')}
          eventHandlers={{
            click: () => onClickUser?.({
              id: myUid,
              nome: 'Você'
            })
          }}
        >
          <Popup>
            <div className="text-sm">
              <b>Você</b>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  )
}
