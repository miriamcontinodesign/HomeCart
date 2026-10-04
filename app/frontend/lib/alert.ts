// Drop-in replacement for React Native's Alert.alert, which is a silent no-op on web.
// One button (or none) -> window.alert; a cancel + action pair -> window.confirm.

type AlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};

function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  const text = message ? `${title}\n\n${message}` : title;
  const action = buttons?.find(b => b.style !== 'cancel');
  const hasCancel = !!buttons?.some(b => b.style === 'cancel');

  if (hasCancel && action) {
    if (window.confirm(text)) action.onPress?.();
    else buttons?.find(b => b.style === 'cancel')?.onPress?.();
    return;
  }
  window.alert(text);
  action?.onPress?.();
}

export const Alert = { alert };
