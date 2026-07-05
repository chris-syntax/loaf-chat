import { createTheme } from '@vanilla-extract/css';
import { color } from 'folds';

export const loafTheme = createTheme(color, {
  Background: {
    Container: '#FFF7ED',
    ContainerHover: '#F5E9D6',
    ContainerActive: '#EFDFC4',
    ContainerLine: '#E5D9C4',
    OnContainer: '#003049',
  },

  Surface: {
    Container: '#FFFFFF',
    ContainerHover: '#F9FAFB',
    ContainerActive: '#F3F4F6',
    ContainerLine: '#E5E7EB',
    OnContainer: '#003049',
  },

  SurfaceVariant: {
    Container: '#F9FAFB',
    ContainerHover: '#F3F4F6',
    ContainerActive: '#E9EBEE',
    ContainerLine: '#E5E7EB',
    OnContainer: '#003049',
  },

  Primary: {
    Main: '#D62828',
    MainHover: '#C11F1F',
    MainActive: '#A81818',
    MainLine: '#8F1414',
    OnMain: '#FFFFFF',
    Container: '#F9DFDF',
    ContainerHover: '#F3C9C9',
    ContainerActive: '#EDB3B3',
    ContainerLine: '#EB9494',
    OnContainer: '#A30000',
  },

  Secondary: {
    Main: '#003049',
    MainHover: '#002438',
    MainActive: '#001C2C',
    MainLine: '#001420',
    OnMain: '#FFF7ED',
    Container: '#D9E0E4',
    ContainerHover: '#C7D0D6',
    ContainerActive: '#B5C1C8',
    ContainerLine: '#8098A4',
    OnContainer: '#003049',
  },

  Success: {
    Main: '#4E9E76',
    MainHover: '#458A67',
    MainActive: '#3C7859',
    MainLine: '#34684D',
    OnMain: '#FFFFFF',
    Container: '#ECFDF5',
    ContainerHover: '#DCFCE9',
    ContainerActive: '#C6F7DA',
    ContainerLine: '#A7EFC5',
    OnContainer: '#1F5B3F',
  },

  Warning: {
    Main: '#D97B2A',
    MainHover: '#C26D24',
    MainActive: '#AC601F',
    MainLine: '#96541B',
    OnMain: '#FFFFFF',
    Container: '#FDECD3',
    ContainerHover: '#FBE0B8',
    ContainerActive: '#F8D39C',
    ContainerLine: '#F3C078',
    OnContainer: '#7A3F0F',
  },

  Critical: {
    Main: '#EF4444',
    MainHover: '#DC3535',
    MainActive: '#C42B2B',
    MainLine: '#AC2222',
    OnMain: '#FFFFFF',
    Container: '#FEF2F2',
    ContainerHover: '#FDE2E2',
    ContainerActive: '#FBCBCB',
    ContainerLine: '#F7A8A8',
    OnContainer: '#7F1D1D',
  },

  Other: {
    FocusRing: 'rgba(214, 40, 40, 0.5)',
    Shadow: 'rgba(0, 48, 73, 0.2)',
    Overlay: 'rgba(0, 48, 73, 0.5)',
  },
});

export const silverTheme = createTheme(color, {
  Background: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Surface: {
    Container: '#EAEAEA',
    ContainerHover: '#DEDEDE',
    ContainerActive: '#D3D3D3',
    ContainerLine: '#C7C7C7',
    OnContainer: '#000000',
  },

  SurfaceVariant: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Primary: {
    Main: '#1245A8',
    MainHover: '#103E97',
    MainActive: '#0F3B8F',
    MainLine: '#0E3786',
    OnMain: '#FFFFFF',
    Container: '#C4D0E9',
    ContainerHover: '#B8C7E5',
    ContainerActive: '#ACBEE1',
    ContainerLine: '#A0B5DC',
    OnContainer: '#0D3076',
  },

  Secondary: {
    Main: '#000000',
    MainHover: '#171717',
    MainActive: '#232323',
    MainLine: '#2F2F2F',
    OnMain: '#EAEAEA',
    Container: '#C7C7C7',
    ContainerHover: '#BBBBBB',
    ContainerActive: '#AFAFAF',
    ContainerLine: '#A4A4A4',
    OnContainer: '#0C0C0C',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(0 0 0 / 50%)',
    Shadow: 'rgba(0 0 0 / 20%)',
    Overlay: 'rgba(0 0 0 / 50%)',
  },
});

const darkThemeData = {
  Background: {
    Container: '#1A1A1A',
    ContainerHover: '#262626',
    ContainerActive: '#333333',
    ContainerLine: '#404040',
    OnContainer: '#F2F2F2',
  },

  Surface: {
    Container: '#262626',
    ContainerHover: '#333333',
    ContainerActive: '#404040',
    ContainerLine: '#4D4D4D',
    OnContainer: '#F2F2F2',
  },

  SurfaceVariant: {
    Container: '#333333',
    ContainerHover: '#404040',
    ContainerActive: '#4D4D4D',
    ContainerLine: '#595959',
    OnContainer: '#F2F2F2',
  },

  Primary: {
    Main: '#F0A8A8',
    MainHover: '#EC9797',
    MainActive: '#E88686',
    MainLine: '#E47575',
    OnMain: '#450808',
    Container: '#5C1F1F',
    ContainerHover: '#672424',
    ContainerActive: '#722929',
    ContainerLine: '#7D2E2E',
    OnContainer: '#FBD8D8',
  },

  Secondary: {
    Main: '#FFFFFF',
    MainHover: '#E5E5E5',
    MainActive: '#D9D9D9',
    MainLine: '#CCCCCC',
    OnMain: '#1A1A1A',
    Container: '#404040',
    ContainerHover: '#4D4D4D',
    ContainerActive: '#595959',
    ContainerLine: '#666666',
    OnContainer: '#F2F2F2',
  },

  Success: {
    Main: '#85E0BA',
    MainHover: '#70DBAF',
    MainActive: '#66D9A9',
    MainLine: '#5CD6A3',
    OnMain: '#0F3D2A',
    Container: '#175C3F',
    ContainerHover: '#1A6646',
    ContainerActive: '#1C704D',
    ContainerLine: '#1F7A54',
    OnContainer: '#CCF2E2',
  },

  Warning: {
    Main: '#E3BA91',
    MainHover: '#DFAF7E',
    MainActive: '#DDA975',
    MainLine: '#DAA36C',
    OnMain: '#3F2A15',
    Container: '#5E3F20',
    ContainerHover: '#694624',
    ContainerActive: '#734D27',
    ContainerLine: '#7D542B',
    OnContainer: '#F3E2D1',
  },

  Critical: {
    Main: '#E69D9D',
    MainHover: '#E28D8D',
    MainActive: '#E08585',
    MainLine: '#DE7D7D',
    OnMain: '#401C1C',
    Container: '#602929',
    ContainerHover: '#6B2E2E',
    ContainerActive: '#763333',
    ContainerLine: '#803737',
    OnContainer: '#F5D6D6',
  },

  Other: {
    FocusRing: 'rgba(255, 255, 255, 0.5)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(0, 0, 0, 0.8)',
  },
};

export const darkTheme = createTheme(color, darkThemeData);

export const butterTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#1A1916',
    ContainerHover: '#262621',
    ContainerActive: '#33322C',
    ContainerLine: '#403F38',
    OnContainer: '#FFFBDE',
  },

  Surface: {
    Container: '#262621',
    ContainerHover: '#33322C',
    ContainerActive: '#403F38',
    ContainerLine: '#4D4B43',
    OnContainer: '#FFFBDE',
  },

  SurfaceVariant: {
    Container: '#33322C',
    ContainerHover: '#403F38',
    ContainerActive: '#4D4B43',
    ContainerLine: '#59584E',
    OnContainer: '#FFFBDE',
  },

  Secondary: {
    Main: '#FFFBDE',
    MainHover: '#E5E2C8',
    MainActive: '#D9D5BD',
    MainLine: '#CCC9B2',
    OnMain: '#1A1916',
    Container: '#403F38',
    ContainerHover: '#4D4B43',
    ContainerActive: '#59584E',
    ContainerLine: '#666459',
    OnContainer: '#F2EED3',
  },
});
