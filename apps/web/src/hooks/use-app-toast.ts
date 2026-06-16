import { useState } from 'react';

export type ToastSeverity = 'success' | 'error';

export type AppToastState = {
  open: boolean;
  message: string;
  severity: ToastSeverity;
};

const initialToastState: AppToastState = {
  open: false,
  message: '',
  severity: 'success',
};

export function useAppToast() {
  const [toast, setToast] = useState<AppToastState>(initialToastState);

  const showToast = (message: string, severity: ToastSeverity) => {
    setToast({ open: true, message, severity });
  };

  const closeToast = () => {
    setToast((prev) => ({ ...prev, open: false }));
  };

  return {
    toast,
    showToast,
    closeToast,
  };
}
