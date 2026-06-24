import { useJarvisVoice } from './useJarvisVoice';

export default function App() {
  const { start, state, text, reply } = useJarvisVoice();

  return (
    <div style={{ padding: 20 }}>
      <button onClick={start}>Activate Alphonso Voice</button>

      <h3>State: {state}</h3>
      <p><b>You:</b> {text}</p>
      <p><b>Alphonso:</b> {reply}</p>
    </div>
  );
}
