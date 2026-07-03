interface ComfyUINode {
  class_type: string;
  inputs: Record<string, unknown>;
}

interface WorkflowJsonTemplate {
  [nodeId: string]: ComfyUINode;
}

export interface MiyaWorkflowTemplate {
  name: string;
  description: string;
  required_inputs: string[];
  workflow_json_template: WorkflowJsonTemplate;
}

export const MIYA_WORKFLOW_TEMPLATES: MiyaWorkflowTemplate[] = [
  {
    name: 'text-to-image',
    description: 'Starter ComfyUI graph for generating a single image from a prompt.',
    required_inputs: ['prompt', 'negative_prompt', 'checkpoint_name', 'width', 'height', 'steps', 'cfg', 'seed'],
    workflow_json_template: {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: '{{checkpoint_name}}'
        }
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: '{{prompt}}',
          clip: ['1', 1]
        }
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: '{{negative_prompt}}',
          clip: ['1', 1]
        }
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: '{{width}}',
          height: '{{height}}',
          batch_size: 1
        }
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed: '{{seed}}',
          steps: '{{steps}}',
          cfg: '{{cfg}}',
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0]
        }
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['5', 0],
          vae: ['1', 2]
        }
      },
      '7': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'miya_text_to_image',
          images: ['6', 0]
        }
      }
    }
  },
  {
    name: 'img-to-img',
    description: 'Starter ComfyUI graph for transforming an existing image with prompt guidance.',
    required_inputs: ['input_image', 'prompt', 'negative_prompt', 'checkpoint_name', 'strength', 'steps', 'cfg', 'seed'],
    workflow_json_template: {
      '1': {
        class_type: 'LoadImage',
        inputs: {
          image: '{{input_image}}'
        }
      },
      '2': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: '{{checkpoint_name}}'
        }
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: '{{prompt}}',
          clip: ['2', 1]
        }
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: '{{negative_prompt}}',
          clip: ['2', 1]
        }
      },
      '5': {
        class_type: 'VAEEncode',
        inputs: {
          pixels: ['1', 0],
          vae: ['2', 2]
        }
      },
      '6': {
        class_type: 'KSampler',
        inputs: {
          seed: '{{seed}}',
          steps: '{{steps}}',
          cfg: '{{cfg}}',
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: '{{strength}}',
          model: ['2', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0]
        }
      },
      '7': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['6', 0],
          vae: ['2', 2]
        }
      },
      '8': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'miya_img_to_img',
          images: ['7', 0]
        }
      }
    }
  },
  {
    name: 'video-from-image',
    description: 'Starter ComfyUI graph for turning a single image into a frame sequence ready for video assembly.',
    required_inputs: ['input_image', 'prompt', 'negative_prompt', 'checkpoint_name', 'frame_count', 'fps', 'seed'],
    workflow_json_template: {
      '1': {
        class_type: 'LoadImage',
        inputs: {
          image: '{{input_image}}'
        }
      },
      '2': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: '{{checkpoint_name}}'
        }
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: '{{prompt}}',
          clip: ['2', 1]
        }
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: '{{negative_prompt}}',
          clip: ['2', 1]
        }
      },
      '5': {
        class_type: 'ImageScale',
        inputs: {
          image: ['1', 0],
          upscale_method: 'nearest-exact',
          width: 1024,
          height: 576,
          crop: 'center'
        }
      },
      '6': {
        class_type: 'KSampler',
        inputs: {
          seed: '{{seed}}',
          steps: 24,
          cfg: 7,
          sampler_name: 'dpmpp_2m',
          scheduler: 'karras',
          denoise: 0.65,
          model: ['2', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0]
        }
      },
      '7': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['6', 0],
          vae: ['2', 2]
        }
      },
      '8': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'miya_video_frames',
          images: ['7', 0]
        }
      }
    }
  }
];

export function listMiyaWorkflowTemplates(): MiyaWorkflowTemplate[] {
  const clone = <T>(value: T): T => (typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)));
  return MIYA_WORKFLOW_TEMPLATES.map((template) => ({ ...template, workflow_json_template: clone(template.workflow_json_template) }));
}

export function getMiyaWorkflowTemplate(name: string): MiyaWorkflowTemplate | null {
  return MIYA_WORKFLOW_TEMPLATES.find((template) => template.name === name) || null;
}
