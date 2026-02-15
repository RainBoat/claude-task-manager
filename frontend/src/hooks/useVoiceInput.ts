import { useCallback, useState } from 'react'

/**
 * Reusable voice input hook using Web Speech API.
 * Returns { listening, startListening, transcript }.
 * Call startListening() to begin recognition; result appended to onResult callback.
 */
export function useVoiceInput(onResult: (text: string) => void, lang = 'zh-CN') {
  const [listening, setListening] = useState(false)

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Speech recognition not supported in this browser')
      return
    }
    const recognition = new SR()
    recognition.lang = lang
    recognition.interimResults = false
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript
      onResult(text)
    }
    recognition.start()
  }, [onResult, lang])

  return { listening, startListening }
}
