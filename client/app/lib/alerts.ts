import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const Toast = MySwal.mixin({
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  showCloseButton: true,
  closeButtonAriaLabel: 'Cerrar alerta',
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

export const showSuccess = (title: string, text?: string) => {
  return Toast.fire({
    icon: 'success',
    title,
    text,
  });
};

export const showError = (title: string, text?: string) => {
  return Toast.fire({
    icon: 'error',
    title,
    text,
  });
};

export const showConfirm = async ({
  title,
  text,
  confirmButtonText = 'Sí, confirmar',
  cancelButtonText = 'Cancelar',
  confirmButtonColor = '#10b981',
}: {
  title: string;
  text: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonColor?: string;
}) => {
  const result = await MySwal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor,
    cancelButtonColor: '#6b7280',
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  });

  return result.isConfirmed;
};

export const showToast = (title: string, icon: 'success' | 'error' | 'warning' | 'info' = 'success') => {
  return Toast.fire({
    icon,
    title,
  });
};
