## Make Real

Try it out at [makereal.tldraw.com](https://makereal.tldraw.com/)

Make Real is built with the [tldraw SDK](https://tldraw.dev/?utm_source=github&utm_medium=readme&utm_campaign=make-real). To build your own version of Make Real, [clone our starter repo](https://github.com/tldraw/make-real-starter).

- To learn more about this project [read our blog post](https://tldraw.dev/blog/product/make-real-the-story-so-far/?utm_source=github&utm_medium=readme&utm_campaign=make-real).
- Show us what you make on [our discord](https://discord.tldraw.com/?utm_source=github&utm_medium=readme&utm_campaign=make-real).

## Setup

### Environment Variables

This application requires an OpenAI API key to function. Follow these steps to set it up:

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Get your OpenAI API key from [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)

3. Edit `.env.local` and replace `sk-proj-your-openai-api-key-here` with your actual API key:
   ```
   OPENAI_API_KEY=sk-proj-your-actual-api-key-here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

**Important**: Never commit your `.env.local` file or share your API keys publicly.

https://github.com/tldraw/draw-a-ui/assets/23072548/aa181d77-6ce6-41de-990d-e5905153579e
