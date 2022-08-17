import { Observable, of } from 'rxjs';
import * as ethers from 'ethers';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { map, switchMap, withLatestFrom } from 'rxjs/operators';
import { HeaderBackgroundColorsEnum } from '../../models/states/header-interfaces';
import {
  PagesEnum,
  PagesStateModel,
} from '../../models/states/pages-interfaces';
import {
  PaymentModel,
  PaymentStateModel,
  PaymentTypesEnum,
} from '../../models/states/payment-interfaces';
import {
  CurrencyService,
  UserService,
  TrezorService,
  LedgerService,
  TranslationService,
  WalletService,
  MiscUtilsService,
} from '../../services';
import { MetamaskService } from '../../services/metamask/metamask.service';
import {
  PagesFacadeService,
  PaymentFacadeService,
  NavigatorFacadeService,
  UserFacadeService,
  ENSRegistrationFacadeService,
} from '../../store/facades';
import { UserModel } from '../../models/states/user-interfaces';
import { PaymentService } from '../../services/payment/payment.service';
import { PaymentLogsService } from '../../services/payment-logs';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SpinnerModesEnum } from 'src/app/models/spinner/spinner-modes.enum';
import { BookmarksServiceService } from 'src/app/services/bookmarks/bookmarks-service.service';
import { RegistrationServiceService } from 'src/app/services/registration/registration-service.service';
import { ENSDomainMetadataModel } from 'src/app/models/canvas';
import { CanvasServicesService } from '../canvas/canvas-services/canvas-services.service';
import { EnsService } from 'src/app/services/ens';
import { generalConfigurations } from 'src/app/configurations';
import { select, Store } from '@ngrx/store';
import {
  ENSRegistrationStateModel,
  ENSRegistrationStepsEnum,
} from 'src/app/models/states/ens-registration-interfaces';
import { getENSRegistrations } from 'src/app/store/selectors';
import { InputTypesEnum } from 'src/app/models/custom-adderss-dialog';
import { RegistrationFacilityService } from 'src/app/services/registration';
import { ProgressBarMode } from '@angular/material/progress-bar';
import { CheckoutServicesService } from './checkout-services/checkout-services.service';

const globalAny: any = global;
const YEARS_IN_SECONDS = 31556952;

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss'],
})
export class CheckoutComponent implements OnInit, OnDestroy {
  headerBackgroundColors: typeof HeaderBackgroundColorsEnum =
    HeaderBackgroundColorsEnum;
  spinnerModes: typeof SpinnerModesEnum = SpinnerModesEnum;
  domainConfigurationForm: FormGroup;
  currentUserData: UserModel;
  pagesState: PagesStateModel;
  paymentState: PaymentStateModel;

  registrationDomains: ENSDomainMetadataModel[] = [];
  registrationStatusTypes: typeof ENSRegistrationStepsEnum =
    ENSRegistrationStepsEnum;
  registrationStatus = ENSRegistrationStepsEnum.BEFORE_COMMIT;
  registrationState: ENSRegistrationStateModel;
  resolvingRegistrantAddress = true;
  registrationListLoaded = false;
  registrationGasPrice = 0;
  timeCommitFulfilled = 0;
  registrationPreviousStatus;
  registrationUpdateGasPrice;
  registrationCurrentTrackedPayment;

  bulkSearchOpen = false;
  bulkSearchAdvancedOpen = false;
  bulkSearchAvailableOnly = false;
  bulkSearchComplete = false;
  bulkSearchBookmarksShow = false;
  bulkSearchAvailableCount = 0;
  bulkSearchResults: ENSDomainMetadataModel[] = [];
  bulkSearchBookmarks: ENSDomainMetadataModel[] = [];

  performBulkSearchSubscription;
  userStateSubscription;
  resolveRegistrantAddressSubscription;
  resolveRegistrantInputTimer;
  registrationStateSubscription;
  paymentStateSubscription;
  pagesStateSubscription;
  getContentHashSubscription;
  staticPaymentTranslatedTexts;
  registrationProcessSubscription;

  constructor(
    protected activatedRoute: ActivatedRoute,
    protected pagesFacade: PagesFacadeService,
    protected userService: UserService,
    protected userFacadeService: UserFacadeService,
    protected paymentFacadeService: PaymentFacadeService,
    protected paymentFacade: PaymentFacadeService,
    protected currencyService: CurrencyService,
    protected navigatorButtonsFacade: NavigatorFacadeService,
    protected paymentService: PaymentService,
    protected metamaskService: MetamaskService,
    protected trezorService: TrezorService,
    protected ledgerService: LedgerService,
    protected translationService: TranslationService,
    protected walletService: WalletService,
    protected changeDetectorRef: ChangeDetectorRef,
    protected paymentLogsService: PaymentLogsService,
    protected miscUtilsService: MiscUtilsService,
    protected registrationFacadeService: ENSRegistrationFacadeService,
    protected registrationStore: Store<ENSRegistrationStateModel>,
    protected registrationService: RegistrationServiceService,
    protected canvasServices: CanvasServicesService,
    protected bookmarksService: BookmarksServiceService,
    protected ensService: EnsService,
    protected pagesFacadeServce: PagesFacadeService,
    protected registrationFacilityService: RegistrationFacilityService,
    public checkoutService: CheckoutServicesService,
    protected snackBar: MatSnackBar,
    protected dialog: MatDialog,
    protected ngZone: NgZone
  ) {
    this.domainConfigurationForm = new FormGroup({
      search: new FormControl(''),
      registrant: new FormControl(''),
      registrantAddress: new FormControl(''),
      duration: new FormControl(1),
      totalCost: new FormControl(0),
      resolverSet: new FormControl(false),
    });
    this.staticPaymentTranslatedTexts =
      this.translationService.getCacheableLanguagekeys('PAYMENT');
  }

  ngOnInit() {
    this.pagesFacade.newPagesState({
      currentPageId: PagesEnum.CHECKOUT,
    } as PagesStateModel);
    this.pagesStateSubscription = this.pagesFacade.pagesState$
      .pipe(
        map((s) => {
          this.pagesState = s;
        })
      )
      .subscribe();
    this.paymentStateSubscription = this.paymentFacadeService.paymentState$
      .pipe(
        map((s) => {
          this.paymentState = s;
          const registrationStatusAssessment =
            this.checkoutService.assessRegistrationStatus(
              this.registrationStatus,
              this.paymentState
            );
          if (registrationStatusAssessment === undefined) {
            return false;
          }
          this.registrationPreviousStatus =
            registrationStatusAssessment === undefined
              ? ENSRegistrationStepsEnum.BEFORE_COMMIT
              : this.registrationStatus;
          this.registrationStatus = registrationStatusAssessment.status;
          if ('trackedPayment' in registrationStatusAssessment === true) {
            this.timeCommitFulfilled =
              registrationStatusAssessment.trackedPayment.paymentDate;
            this.registrationCurrentTrackedPayment =
              registrationStatusAssessment.trackedPayment;
          }
        })
      )
      .subscribe();
    this.userStateSubscription = this.userFacadeService.userState$
      .pipe(
        withLatestFrom(this.paymentFacadeService.paymentState$),
        switchMap((states) => {
          const [s, p] = states;
          if ('walletAddress' in s.user && s.user.walletAddress !== undefined) {
            this.currentUserData = { ...s.user };
            let nameToResolveAsRegistrant = this.getCurrentRegistrantAddress(
              s.user.walletAddress,
              Object.keys(p.entities).map((i) => p.entities[i])
            );
            this.domainConfigurationForm.controls.registrantAddress.setValue(
              nameToResolveAsRegistrant.address
            );
            if (nameToResolveAsRegistrant.isEthName === false) {
              return this.userService.getEthName(
                globalAny.canvasProvider,
                nameToResolveAsRegistrant.address
              );
            }
            return of(nameToResolveAsRegistrant.eth);
          }
          this.pagesFacade.gotoPageRoute('home', PagesEnum.HOME);
          return of(null);
        }),
        map((r) => {
          if (r === null || r === false) {
            this.domainConfigurationForm.controls.registrant.setValue(
              this.currentUserData.walletAddress
            );
            return;
          }
          this.currentUserData.ethName = r as string;
          this.domainConfigurationForm.controls.registrant.setValue(
            this.currentUserData.ethName
          );
        })
      )
      .subscribe();
    this.loadRegistrations();
    this.performBulkSearch(
      true,
      Object.keys(this.registrationDomains).map(
        (d) => this.registrationDomains[d].labelName
      )
    );
  }

  ngOnDestroy() {
    if (this.registrationStateSubscription) {
      this.registrationStateSubscription.unsubscribe();
    }
    if (this.resolveRegistrantAddressSubscription) {
      this.resolveRegistrantAddressSubscription.unsubscribe();
    }
    if (this.userStateSubscription) {
      this.userStateSubscription.unsubscribe();
    }
    if (this.getContentHashSubscription) {
      this.getContentHashSubscription.unsubscribe();
    }
    if (this.pagesStateSubscription) {
      this.pagesStateSubscription.unsubscribe();
    }
    if (this.paymentStateSubscription) {
      this.paymentStateSubscription.unsubscribe();
    }
    if (this.registrationProcessSubscription) {
      this.registrationProcessSubscription.unsubscribe();
    }
  }

  loadRegistrations() {
    this.registrationStateSubscription =
      this.registrationFacadeService.getENSRegistrationState$
        .pipe(
          withLatestFrom(
            this.registrationStore.pipe(select(getENSRegistrations))
          ),
          map((state) => {
            const [registrationState, registrations] = state;
            this.registrationDomains = registrations;
            this.registrationListLoaded = true;
            this.registrationState = registrationState;
            if (
              this.registrationDomains.length <= 0 &&
              this.registrationPreviousStatus ===
                ENSRegistrationStepsEnum.BEFORE_COMMIT
            ) {
              this.checkoutService.showCartEmptyDialog();
              return;
            }
            this.performBulkSearch(
              true,
              this.registrationDomains.map((d) => d.labelName)
            );
          })
        )
        .subscribe();
  }

  goToHome() {
    this.pagesFacade.gotoPageRoute('home', PagesEnum.HOME);
  }

  goToProfile() {
    this.pagesFacade.gotoPageRoute(
      'profile/' +
        this.domainConfigurationForm.controls.registrantAddress.value,
      PagesEnum.PROFILE
    );
  }

  /*********************
   *
   * Registration tools
   *
   *********************/
  commitRegistration() {
    if (
      this.bulkSearchResults.filter((d) => d.isAvailable === true).length > 0
    ) {
      this.snackBar.open(
        'Cannot proceed with an already registered domain, pleaes try again.',
        'close',
        {
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          duration: 15000000000,
        }
      );
      return;
    }
    if (globalAny.canvasProvider === undefined) {
      return false;
    }
    if (this.registrationProcessSubscription) {
      this.registrationProcessSubscription.unsubscribe();
      this.registrationProcessSubscription = undefined;
    }
    const resolverSet = this.domainConfigurationForm.controls.resolverSet.value;
    const registrant = this.domainConfigurationForm.controls.registrant.value;
    const registrantAddress =
      this.domainConfigurationForm.controls.registrantAddress.value;
    this.registrationProcessSubscription = this.checkoutService
      .commitRegistration(
        this.registrationDomains,
        this.currentUserData.walletAddress,
        registrantAddress,
        resolverSet,
        this.durationInSeconds,
        this.paymentState.ethUsdPrice,
        registrant
      )
      .subscribe();
  }

  completeRegistration() {
    if (
      this.bulkSearchResults.filter((d) => d.isAvailable === true).length > 0
    ) {
      this.snackBar.open(
        'Cannot proceed with an already registered domain, pleaes try again.',
        'close',
        {
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          duration: 15000000000,
        }
      );
      return;
    }
    if (globalAny.canvasProvider === undefined) {
      return false;
    }
    if (this.registrationProcessSubscription) {
      this.registrationProcessSubscription.unsubscribe();
      this.registrationProcessSubscription = undefined;
    }
    this.registrationProcessSubscription = this.checkoutService
      .completeRegistration(
        this.registrationCurrentTrackedPayment,
        this.currentUserData.walletAddress,
        this.paymentState.ethUsdPrice,
        this.domainConfigurationForm.controls.registrant.value
      )
      .subscribe();
  }

  openDurationSettingDialog() {
    this.canvasServices.openCustomAddressDialog(
      'FORM_LABELS.ENTER_DURATION',
      'FORM_ERRORS.INVALID_DURATION',
      (p) => {
        if (p === undefined || p === null || p < 0.1) {
          return of(false);
        }
        this.domainConfigurationForm.controls.duration.setValue(p);
        return of(true);
      },
      this.domainConfigurationForm.controls.duration.value === ''
        ? 1
        : this.domainConfigurationForm.controls.duration.value,
      InputTypesEnum.NUMERIC
    );
  }

  calculateNameCost(name: string) {
    return this.ensService.calculateDomainsPrice(
      name,
      this.paymentState.ethUsdPrice,
      parseFloat(this.domainConfigurationForm.controls.duration.value)
    );
  }

  getCurrentRegistrantAddress(
    defaultAddress: string,
    paymentsData: PaymentModel[]
  ) {
    if (paymentsData.length <= 0) {
      return {
        address: defaultAddress,
        eth: null,
        isEthName: false,
      };
    }
    const lastPayment = paymentsData[paymentsData.length - 1];
    if (
      lastPayment.paymentType === PaymentTypesEnum.COMMIT ||
      (lastPayment.paymentType === PaymentTypesEnum.REGISTER &&
        lastPayment.paymentStatus === false)
    ) {
      return {
        address: lastPayment.paymentRawRecord[0].owner,
        eth: lastPayment.paymentPayerEthName,
        isEthName: lastPayment.paymentPayerEthName.indexOf('.eth') > -1,
      };
    }
    return {
      address: defaultAddress,
      eth: null,
      isEthName: false,
    };
  }

  countRegistrations() {
    return this.registrationService.countRegistrations();
  }

  removeRegistrations(domain: string) {
    this.registrationFacadeService.removeRegistration(
      this.registrationDomains.filter((d) => d.labelName === domain)[0]
    );
    if (
      this.registrationDomains.length <= 1 &&
      this.registrationPreviousStatus === ENSRegistrationStepsEnum.BEFORE_COMMIT
    ) {
      this.checkoutService.showCartEmptyDialog();
    }
  }

  resolveRegistrantAddressInput() {
    if (this.domainConfigurationForm.controls.registrant.value === '') {
      this.resolvingRegistrantAddress = true;
      this.domainConfigurationForm.controls.registrantAddress.setValue(false);
      return;
    }
    if (this.resolveRegistrantInputTimer !== undefined) {
      clearTimeout(this.resolveRegistrantInputTimer);
    }
    this.resolvingRegistrantAddress = false;
    this.resolveRegistrantInputTimer = setTimeout(() => {
      this.resolveRegistrantAddressSubscription = this.userService
        .getEthAddress(
          globalAny.canvasProvider,
          this.domainConfigurationForm.controls.registrant.value
        )
        .pipe(
          map((r) => {
            this.resolvingRegistrantAddress = true;
            if (r === null || r === false) {
              this.domainConfigurationForm.controls.registrantAddress.setValue(
                false
              );
              return;
            }
            this.domainConfigurationForm.controls.registrantAddress.setValue(r);
          })
        )
        .subscribe();
    }, 1000);
  }

  performBulkSearch(noSearchFormToggle = false, entries: string[]) {
    this.bulkSearchComplete = false;
    this.bulkSearchResults = [];
    this.bulkSearchAvailableCount = 0;
    if (this.performBulkSearchSubscription) {
      this.performBulkSearchSubscription.unsubscribe();
      this.performBulkSearchSubscription = undefined;
    }
    let toFind = entries;
    this.performBulkSearchSubscription = this.ensService
      .findDomains(toFind)
      .subscribe((r) => {
        for (const f of toFind) {
          let found;
          (r as any).registrations.map((d) => {
            if (d.labelName === f && found === undefined) {
              found = d;
            }
          });
          const fData = {
            labelName: f.toLowerCase(),
            isAvailable: found === undefined ? false : true,
          } as ENSDomainMetadataModel;
          if (found === undefined) {
            this.bulkSearchAvailableCount++;
          }
          if (found !== undefined) {
            fData.expiry = found.expiryDate;
            const gPeriod = this.ensService.calculateGracePeriodPercentage(
              parseInt(fData.expiry, 10)
            );
            fData.gracePeriodPercent =
              gPeriod < -100 ? undefined : 100 - Math.abs(gPeriod);
          }
          this.bulkSearchResults.push(fData);
        }
        this.bulkSearchComplete = true;
      });
    if (noSearchFormToggle === true) {
      return;
    }
  }

  resetRegistrantInput() {
    if ('ethName' in this.currentUserData) {
      this.domainConfigurationForm.controls.registrant.setValue(
        this.currentUserData.ethName
      );
      return;
    }
    this.domainConfigurationForm.controls.registrant.setValue(
      this.currentUserData.walletAddress
    );
    this.resolveRegistrantAddressInput();
  }

  nextAction() {
    return this.checkoutService.asessRegistrationStageAction(
      this.registrationStatus,
      {
        commitRegistrationMethod: () => this.commitRegistration(),
        completeRegistrationMethod: () => this.completeRegistration(),
      }
    );
  }

  get progressLoaderMode() {
    if (
      this.registrationStatus === ENSRegistrationStepsEnum.COMMIT_SENT ||
      this.registrationStatus === ENSRegistrationStepsEnum.REGISTRATION_SENT
    ) {
      return 'indeterminate' as ProgressBarMode;
    }
    return 'determinate' as ProgressBarMode;
  }

  get progressLoaderValue() {
    if (this.registrationStatus !== ENSRegistrationStepsEnum.AWAIT) {
      return 0;
    }
    const timeToWait = this.checkoutService.timeToWait(
      this.timeCommitFulfilled
    );
    if (
      timeToWait > 100 &&
      this.registrationStatus === ENSRegistrationStepsEnum.AWAIT
    ) {
      this.registrationStatus = ENSRegistrationStepsEnum.BEFORE_REGISTRATION;
      return 100;
    } else if (this.registrationStatus === ENSRegistrationStepsEnum.AWAIT) {
      const timeToWait = this.checkoutService.timeToWait(
        this.timeCommitFulfilled
      );
      return timeToWait;
    } else {
      return 0;
    }
  }

  get gasPrice() {
    const timeNow = new Date().getTime();
    if (
      this.registrationUpdateGasPrice === undefined ||
      timeNow >
        this.registrationUpdateGasPrice +
          generalConfigurations.timeToUpdateRegistrationGasPrice
    ) {
      this.registrationUpdateGasPrice = new Date().getTime();
      return new Observable((observer) => {
        globalAny.canvasProvider.getGasPrice().then((r) => {
          this.registrationGasPrice = parseFloat(
            parseFloat(
              ethers.utils.formatUnits(r as ethers.BigNumber, 'gwei')
            ).toFixed(2)
          );
          observer.next(this.registrationGasPrice);
          observer.complete();
        });
      });
    }
    return of(this.registrationGasPrice);
  }

  get duration() {
    return this.domainConfigurationForm.controls.duration.value;
  }

  get durationInSeconds() {
    return parseInt(
      (
        YEARS_IN_SECONDS * this.domainConfigurationForm.controls.duration.value
      ).toString(),
      10
    );
  }

  get registrantIdIsEth() {
    if (this.domainConfigurationForm.controls.registrant.value === undefined) {
      return false;
    }
    return (
      this.domainConfigurationForm.controls.registrant.value.indexOf('.eth') >
      -1
    );
  }
  get registrant() {
    return this.domainConfigurationForm.controls.registrant.value;
  }

  get totalCost() {
    if (
      this.registrationDomains === undefined ||
      this.paymentState?.ethUsdPrice === undefined ||
      this.paymentState?.ethUsdPrice === '0.00'
    ) {
      return 0.0;
    }
    let totalCostCalculated = 0.0;
    for (const d of Object.keys(this.registrationDomains)) {
      totalCostCalculated += this.ensService.calculateDomainsPrice(
        this.registrationDomains[d],
        this.paymentState.ethUsdPrice,
        parseFloat(this.domainConfigurationForm.controls.duration.value)
      );
    }
    this.domainConfigurationForm.controls.totalCost.setValue(
      (totalCostCalculated * 10 ** 18).toString()
    );
    return totalCostCalculated;
  }

  get totalCostTruncated() {
    return this.totalCost.toFixed(4);
  }

  get ethUsdPrice() {
    return this.paymentFacade.ethUsdPrice$.pipe(
      switchMap((r) => {
        return of(r);
      })
    );
  }
}
