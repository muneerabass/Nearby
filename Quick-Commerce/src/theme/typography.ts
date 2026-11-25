import { TextStyle } from 'react-native';

/**
 * Each face is loaded at app start. Select the intended face through `fontFamily`
 * rather than a separate weight style; this renders consistently on iOS, Android,
 * and web.
 */
export const fontFamilies = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
} as const;

type Variant =
  | 'display'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'body'
  | 'bodyStrong'
  | 'bodySmall'
  | 'caption'
  | 'captionStrong'
  | 'overline'
  | 'button'
  | 'buttonSmall';

export const typography: Record<Variant, TextStyle> = {
  display: { fontFamily: fontFamilies.extraBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  heading1: { fontFamily: fontFamilies.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading2: { fontFamily: fontFamilies.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  heading3: { fontFamily: fontFamilies.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fontFamilies.semiBold, fontSize: 15, lineHeight: 21 },
  bodySmall: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamilies.medium, fontSize: 11.5, lineHeight: 15 },
  captionStrong: { fontFamily: fontFamilies.bold, fontSize: 11.5, lineHeight: 15 },
  overline: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  button: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 20, letterSpacing: -0.1 },
  buttonSmall: { fontFamily: fontFamilies.bold, fontSize: 13.5, lineHeight: 17 },
};

export type TypographyVariant = Variant;
