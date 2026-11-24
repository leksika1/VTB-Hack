import { createElement, type ComponentType, type SVGProps } from 'react';
import {
  CategoryAcceptOutline,
  CategoryBankOutline,
  CategoryBarChartOutline,
  CategoryCarOutline,
  CategoryChartOutline,
  CategoryClipboardOutline,
  CategoryDepositOutline,
  CategoryDesktopOutline,
  CategoryLayoutOutline,
  CategoryReceiptOutline,
  CategoryShopCartOutline,
  CategoryStudyOutline,
  DocumentsAddTemplateOutline,
  DocumentsArchiveOutline,
  DocumentsCopyOutline,
  DocumentsVerifySignOutline,
  FinancePayCashOutline,
  SecuritySafetyCertificateOutline,
  ServiceCheckOutline,
  ServiceCloseOutline,
  ServiceErrorOutline,
  ServiceErrorTriangleOutline,
  ServiceEyeOutline,
  ServicePlayOutline,
  ServicePlusOutline,
  ServiceShareOutline,
  SystemArrowLeftOutline,
  SystemArrowRightOutline,
  SystemArrowsHorizontalOutline,
  SystemBalanceOutline,
  SystemCalendarOutline,
  SystemCalendarUpdateOutline,
  SystemChevronDownOutline,
  SystemChevronLeftOutline,
  SystemChevronRightOutline,
  SystemDarkModeOutline,
  SystemDeleteOutline,
  SystemDownloadOutline,
  SystemEditOutline,
  SystemExitOutline,
  SystemHomeOutline,
  SystemHourglassOutline,
  SystemLightModeOutline,
  SystemLinkOutline,
  SystemMoreHorizontalOutline,
  SystemNotificationsOutline,
  SystemPeopleOutline,
  SystemPersonAddOutline,
  SystemRefreshOutline,
  SystemSearchOutline,
  SystemStarOutline,
  SystemTuneOutline,
  SystemUndoOutline,
  SystemUpdateOutline,
} from '@admiral-ds/icons';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
export type AppIcon = ComponentType<IconProps>;

/** Size square Admiral glyphs consistently inside controls and inline labels. */
function sized(Glyph: ComponentType<SVGProps<SVGSVGElement>>): AppIcon {
  return function Icon({ size = 20, className = '', ...props }) {
    return createElement(Glyph, { width: size, height: size, 'aria-hidden': props['aria-label'] ? undefined : true, ...props, className: `admiral-glyph ${className}` });
  };
}

export const Archive = sized(DocumentsArchiveOutline);
export const ArrowLeft = sized(SystemArrowLeftOutline);
export const ArrowRight = sized(SystemArrowRightOutline);
export const ArrowRightLeft = sized(SystemArrowsHorizontalOutline);
export const Study = sized(CategoryStudyOutline);
export const Verified = sized(DocumentsVerifySignOutline);
export const Bell = sized(SystemNotificationsOutline);
export const Calendar = sized(SystemCalendarOutline);
export const CalendarUpdate = sized(SystemCalendarUpdateOutline);
export const Car = sized(CategoryCarOutline);
export const BarChart = sized(CategoryBarChartOutline);
export const ChartPie = sized(CategoryChartOutline);
export const Check = sized(ServiceCheckOutline);
export const ChevronDown = sized(SystemChevronDownOutline);
export const ChevronLeft = sized(SystemChevronLeftOutline);
export const ChevronRight = sized(SystemChevronRightOutline);
export const ErrorIcon = sized(ServiceErrorOutline);
export const Accept = sized(CategoryAcceptOutline);
export const Clipboard = sized(CategoryClipboardOutline);
export const Copy = sized(DocumentsCopyOutline);
export const AddTemplate = sized(DocumentsAddTemplateOutline);
export const Download = sized(SystemDownloadOutline);
export const MoreHorizontal = sized(SystemMoreHorizontalOutline);
export const Eye = sized(ServiceEyeOutline);
export const PayCash = sized(FinancePayCashOutline);
export const Hourglass = sized(SystemHourglassOutline);
export const Home = sized(SystemHomeOutline);
export const Bank = sized(CategoryBankOutline);
export const Dashboard = sized(CategoryLayoutOutline);
export const LinkIcon = sized(SystemLinkOutline);
export const LogOut = sized(SystemExitOutline);
export const Monitor = sized(CategoryDesktopOutline);
export const Moon = sized(SystemDarkModeOutline);
export const Edit = sized(SystemEditOutline);
export const Deposit = sized(CategoryDepositOutline);
export const Play = sized(ServicePlayOutline);
export const Plus = sized(ServicePlusOutline);
export const Receipt = sized(CategoryReceiptOutline);
export const Refresh = sized(SystemRefreshOutline);
export const Update = sized(SystemUpdateOutline);
export const Balance = sized(SystemBalanceOutline);
export const Search = sized(SystemSearchOutline);
export const Share = sized(ServiceShareOutline);
export const ShieldCheck = sized(SecuritySafetyCertificateOutline);
export const ShopCart = sized(CategoryShopCartOutline);
export const Tune = sized(SystemTuneOutline);
export const Star = sized(SystemStarOutline);
export const Sun = sized(SystemLightModeOutline);
export const DeleteIcon = sized(SystemDeleteOutline);
export const WarningIcon = sized(ServiceErrorTriangleOutline);
export const Undo = sized(SystemUndoOutline);
export const PersonAdd = sized(SystemPersonAddOutline);
export const Users = sized(SystemPeopleOutline);
export const CloseIcon = sized(ServiceCloseOutline);
