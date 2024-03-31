import { uuid, Action, ActionProps, llm, res, ChatHistory, AudioPlayer } from '@enconvo/api';
import { HumanMessagePromptTemplate } from '@langchain/core/prompts';
import axios from 'axios'

async function getCurrentWeather(text: string) {

    let url = `https://api.enconvo.com/third/weather?function=current&days=3&q=${text}&aqi=yes&alerts=yes`;


    let params = {
        "q": text,
    };


    const headers = {
        "Content-Type": "application/json",
    }

    const response = await axios.get(url, { headers, params })

    return response.data

}

export default async function main(req: Request) {
    try {
        const { options } = await req.json()
        const { text } = options

        let translateText = text || options.city;

        // 如果translateText中有换行符，需要添加> 符号
        const requestId = uuid()

        if (text) {
            await res.context({ id: requestId, role: "human", content: text })
        } else {
            await res.context({ id: requestId, role: "human", content: `Get ${options.city}'s current weather.` })
        }

        res.write("Fetching data ...", true)


        let weatherResponse = "";
        try {
            weatherResponse = JSON.stringify(await getCurrentWeather(translateText))
        } catch (e: any) {
            weatherResponse = e._message
        }


        const chat = llm.chatModel(options.llm);

        let responseLanguage = "";

        if (options.responseLanguage && options.responseLanguage !== "auto") {

            responseLanguage = `Response using Language: ${options.responseLanguage}`;
        }


        const template = HumanMessagePromptTemplate.fromTemplate(
            `Below is the information about today's weather, please summarize it for me, and provide me with travel and dressing advice.
Weather API response: {text}

{responseLanguage}

Summarization & Suggestions:`,
        );

        const message = await template.format({
            text: weatherResponse,
            responseLanguage: responseLanguage
        });


        let result = "";
        if (options.auto_audio_play === 'true') {
            await AudioPlayer.streamPlay(result, false, true, options.tts)
        }

        const stream = await chat.stream([message]);

        res.write("", true)
        for await (const chunk of stream) {
            const token = chunk.content
            result += token;
            res.write(token).then()
            if (token && options.auto_audio_play === 'true') {
                result += token;
                AudioPlayer.streamPlay(result, false, false, options.tts).then()
            }
        }


        if (options.auto_audio_play === 'true') {
            AudioPlayer.streamPlay(result, true, false, options.tts).then();
        }

        await ChatHistory.saveChatMessages({
            input: translateText,
            output: result,
            requestId: requestId
        });


        const actions: ActionProps[] = [
            Action.Paste(result, true),
            Action.PlayAudio(result, "Play Audio", false, options.tts),
            Action.Copy(result)
        ]

        const output = {
            content: result,
            actions: actions
        }

        return output;
    } catch (err) {
        return "error" + err;
    }
}
