import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchHelp } from "@/lib/api"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    text: "Hi! Ask me anything about Localyze: zip search, filters, saving, reviews, or coupons.",
  },
]

interface HelpChatProps {
  open: boolean
  onClose: () => void
}

export function HelpChat({ open, onClose }: HelpChatProps) {
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)

  const handleSend = async () => {
    if (!chatInput.trim()) return
    const message = chatInput.trim()
    setChatInput("")
    setMessages((prev) => [...prev, { role: "user", text: message }])
    try {
      const response = await fetchHelp(message)
      setMessages((prev) => [...prev, { role: "assistant", text: response.reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, I could not connect. Please try again." },
      ])
    }
  }

  return (
    <div
      className={`fixed right-6 top-20 z-[10050] w-[min(420px,90vw)] transition duration-300 ${
        open ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0 pointer-events-none"
      }`}
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Localyze Assistant</p>
            <p className="text-xs text-slate-400">Intelligent help, powered by your data.</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-4 p-4">
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`rounded-xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-emerald-400 text-slate-950"
                    : "bg-slate-900 text-slate-200"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ask a question..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSend()
              }}
            />
            <Button onClick={handleSend}>Send</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
