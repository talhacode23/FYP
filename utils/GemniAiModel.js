/**
 * Gemini AI model setup
 *
 * $ npm install @google/generative-ai
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai'

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

if (!apiKey) {
  // Fail fast with a clear message if the API key is missing
  throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not set')
}

const genAI = new GoogleGenerativeAI(apiKey)

// Configuration for how Gemini should respond
const generationConfig = {
  temperature: 0.45,     // slightly higher for more varied, role-specific Qs
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 2048, // enough for long feedback
  responseMimeType: 'text/plain',
}

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: `
You are a senior technical interview coach helping candidates practice.
- Always tailor questions and feedback to the provided role, responsibilities, and experience.
- Keep every question unique to the current job description; avoid generic or repeated items.
- Prefer clear, specific, role-relevant details over generic advice.
- When giving feedback, be detailed, actionable, and include a concise ideal/model answer.
If you are unsure, say you are unsure instead of guessing.
`,
})

/**
 * Stateless "chatSessions" wrapper for compatibility.
 * Every call creates a fresh request (no shared history),
 * so questions/feedback are based only on the current prompt.
 */
export const chatSessions = {
  async sendMessage(prompt) {
    return model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    })
  },
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Generic helper with retry logic for rate limits / transient errors.
 * Returns the full Gemini result (use result.response.text()).
 */
export const sendMessageWithRetry = async (
  prompt,
  { retries = 2, backoffMs = 1200 } = {},
) => {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await chatSessions.sendMessage(prompt)
    } catch (error) {
      lastError = error
      const status = error?.response?.status
      const isRetryable = status === 429 || status === 503
      if (!isRetryable || attempt === retries) {
        throw error
      }
      await wait(backoffMs * (attempt + 1))
    }
  }
  throw lastError
}

// --- Prompt builders used across the app ---
export const buildQuestionPrompt = ({
  Job_Position,
  Job_Description,
  Year_Of_Experience,
  sessionId,
}) => `Generate a fresh set of 5 unique interview Q&A pairs tailored ONLY to this role:
- Job Position: ${Job_Position || 'N/A'}
- Job Description: ${Job_Description || 'N/A'}
- Years of Relevant Experience: ${Year_Of_Experience || 'N/A'}
- Uniqueness token (use to avoid repeating prior questions): ${
  sessionId || Date.now()
}

Strict rules:
- Treat the uniqueness token as a seed; do NOT echo it in the output.
- Every question must explicitly reference BOTH the job position AND a concrete responsibility/tech from the description; no generic repeats.
- Avoid overlapping topics; each question should cover a different key requirement (e.g., architecture, performance, security, testing, collaboration).
- Vary the question forms (what/how/why/scenario/troubleshooting) to reduce repetition.
- Provide a detailed, well-structured ideal answer for each question (3-6 sentences or bullet-like statements).
- Output JSON ONLY: an array of exactly 5 objects with keys "question" and "answer".
- Do not wrap in markdown or add commentary.`

export const buildFeedbackPrompt = ({
  question,
  userAnswer,
  idealAnswer,
  jobPosition,
  jobDescription,
  experience,
}) => `Provide structured feedback for the candidate's answer.
Context:
- Job Position: ${jobPosition || 'N/A'}
- Job Description: ${jobDescription || 'N/A'}
- Years of Experience: ${experience || 'N/A'}
- Question: ${question || 'N/A'}
- Ideal/Model Answer (for your reference, refine if needed): ${idealAnswer || 'N/A'}
- Candidate Answer: ${userAnswer || 'N/A'}

Strictly return ONE JSON object with keys:
- "rating": number 1-10
- "feedback": 4-6 full sentences of detailed, constructive guidance
- "model_answer": a concise, high-quality model answer for the question
No markdown, no additional keys.`

/**
 * Generate interview questions tailored to a specific
 * job description and candidate experience.
 *
 * Usage:
 *   const text = await generateQuestions(jd, experience)
 */
export async function generateQuestions(jobDescription, experience) {
  const prompt = `
You are an expert technical interviewer.

Job description:
${jobDescription}

Candidate experience:
${experience}

Generate 10 UNIQUE interview questions tailored ONLY to this job description and this experience.
- Mix theory, practical, scenario-based, and behavioral questions.
- Every question must clearly relate to the JD and the candidate experience above.
- Do NOT reuse questions from previous interviews.
Return only a numbered list (1., 2., 3., ...) with no extra explanation.
`

  const result = await sendMessageWithRetry(prompt)
  return result.response.text()
}

/**
 * Get full, detailed feedback + an ideal answer
 * for a single question/answer pair.
 *
 * Usage:
 *   const text = await getDetailedFeedback({
 *     jobDescription,
 *     question,
 *     userAnswer,
 *   })
 */
export async function getDetailedFeedback({
  jobDescription,
  question,
  userAnswer,
}) {
  const prompt = `
You are a senior technical interview coach.

Job description:
${jobDescription}

Interview question:
${question}

Candidate's answer:
${userAnswer}

Give full, detailed feedback using EXACTLY this structure:

### Score
- A single score from 0–10 with 1–2 sentences explaining why.

### Strengths
- 3–5 bullet points.
- Each bullet must be 1–3 sentences and refer to specific parts of the answer.

### Improvements
- 3–5 bullet points.
- Each bullet must be 1–3 sentences and be concrete and practical.

### Ideal Answer
- Write a complete, correct model answer in 2–4 paragraphs.
- Explain clearly, as if to a beginner.

Use at least 200 words in total. Do not skip any section.
`

  const result = await sendMessageWithRetry(prompt)
  return result.response.text()
}