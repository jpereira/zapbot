import Replicate from "replicate";
import dotenv from 'dotenv';
dotenv.config();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function replicateGenerateImage(prompt, model_string) {
const output = await replicate.run(
// normal "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
//  "stability-ai/sdxl:a00d0b7dcbb9c3fbb34ba87d2d5b46c56969c84a628bf778a7fdaec30b1b99c5",
//"prompthero/openjourney:ad59ca21177f9e217b9075e7300cf6e14f7e5b4505b87b9689dbd866e9768969",
//"ai-forever/kandinsky-2.2:ea1addaab376f4dc227f5368bbd8eff901820fd1cc14ed8cad63b29249e9d463",
//"prompthero/epicrealism:dd027f64fca42dca8a3debe12920c876f5dca7a0f6dcb08fab5ded5c42e4b4ad",
model_string,
	{
    input: {
      prompt: prompt,
	   negative_prompt: "noisy, sloppy, messy, grainy, highly detailed, ultra textured, photo, NSFW"
    }
  }
);
return output[0]
}

async function replicateGenerateAudio(prompt) {
const output = await replicate.run(
  "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05",
  {
    input: {
      prompt_a: prompt
    }
  }
);
console.log(output.audio)
return output.audio
}

export { replicateGenerateImage, replicateGenerateAudio}