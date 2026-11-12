import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { setTheme, storedTheme, type ThemeChoice } from '@/theme';
import { de } from '@/i18n/de';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: de.settings.themeLight, Icon: Sun },
  { value: 'dark', label: de.settings.themeDark, Icon: Moon },
  { value: 'system', label: de.settings.themeSystem, Icon: Monitor },
];

export function SettingsPage() {
  const [theme, setThemeState] = useState<ThemeChoice>(storedTheme);
  const auth = useAuth();
  return (
    <>
      <PageHeader title={de.settings.title} back />
      <Card>
        <CardHeader>
          <CardTitle>{de.settings.security}</CardTitle>
        </CardHeader>
        <CardContent>
          {auth.status === 'locked' ? (
            <Button asChild className="w-full">
              <Link to="/unlock?next=%2Fmore%2Fsettings">{de.lock.bannerAction}</Link>
            </Button>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => void auth.lock()}>
              {de.lock.lockNow}
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{de.settings.appearance}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2" role="group" aria-label={de.settings.appearance}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <Button
              key={value}
              variant={theme === value ? 'default' : 'outline'}
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value);
                setThemeState(value);
              }}
            >
              <Icon aria-hidden />
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
