import { registerWebModule, NativeModule } from 'expo';

// MausosSmsModule is not available on the web platform.
class MausosSmsModule extends NativeModule<{}> {}

export default registerWebModule(MausosSmsModule, 'MausosSmsModule');
