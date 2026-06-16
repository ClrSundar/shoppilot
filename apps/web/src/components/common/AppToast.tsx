import { Alert, Snackbar } from '@mui/material';

import type { AppToastState } from '@/hooks/use-app-toast';

type AppToastProps = {
  toast: AppToastState;
  onClose: () => void;
  autoHideDuration?: number;
};

export function AppToast({
  toast,
  onClose,
  autoHideDuration = 3000,
}: AppToastProps) {
  return (
    <Snackbar
      open={toast.open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert onClose={onClose} severity={toast.severity} variant="filled">
        {toast.message}
      </Alert>
    </Snackbar>
  );
}
