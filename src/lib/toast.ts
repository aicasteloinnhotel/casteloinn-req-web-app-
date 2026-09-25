import { toast as sonnerToast } from 'sonner';
import { audioService } from './audio';

const playSuccess = () => audioService.playSuccess();
const playError = () => audioService.playError();
const playInfo = () => audioService.playClick(); // Or a specific info sound if we want

type ToastParams = Parameters<typeof sonnerToast>;

export const toast = Object.assign(
  (...args: ToastParams) => {
    playInfo();
    return sonnerToast(...args);
  },
  {
    ...sonnerToast,
    success: (message: string | React.ReactNode, data?: any) => {
      playSuccess();
      return sonnerToast.success(message, data);
    },
    error: (message: string | React.ReactNode, data?: any) => {
      playError();
      return sonnerToast.error(message, data);
    },
    warning: (message: string | React.ReactNode, data?: any) => {
      playError(); // Use error sound for warnings too for now
      return sonnerToast.warning(message, data);
    },
    info: (message: string | React.ReactNode, data?: any) => {
      playInfo();
      return sonnerToast.info(message, data);
    }
  }
);
